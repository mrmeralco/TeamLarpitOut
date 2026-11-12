import { Body, Controller, Header, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { BillChecksModule } from "../bill-checks/bill-checks.module.js";
import { BillChecksService } from "../bill-checks/bill-checks.service.js";
import type { BillSource } from "../bills/bill-source.js";
import { BillsModule } from "../bills/bills.module.js";
import type { CoachProvider } from "../coach/coach-provider.interface.js";
import { CoachModule } from "../coach/coach.module.js";
import { BILL_SOURCE, COACH_PROVIDER } from "../common/injection-tokens.js";
import { chargeFactsFor, classifyQuestion, figuresComeFromFacts, templateChargeAnswer } from "../domain/charge-chat.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";
import { HouseholdsModule } from "../households/households.module.js";
import { AskChargeDto } from "./dto/ask-charge.dto.js";

/** Stateless: each question is answered on its own and nothing is kept. */
@Injectable()
export class ChargeChatService {
  constructor(
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
    @Inject(COACH_PROVIDER) private readonly coach: CoachProvider,
    private readonly billChecks: BillChecksService,
  ) {}

  async ask(sin: string, lineId: string, question: string) {
    const history = (await this.bills.bills(sin)).slice().sort((a, b) => a.period.localeCompare(b.period));
    const checks = await this.billChecks.checkForHousehold(sin).catch(() => null);
    const facts = chargeFactsFor(history, lineId, checks?.overall ?? "green");
    if (!facts) throw new NotFoundException({ error: "There is no such charge on the latest Bill." });

    const intent = classifyQuestion(question, facts);
    const summary = checks?.summary ?? null;
    if (intent === "complaint") return { lineId, kind: "askMeralco" as const, source: "template" as const, answer: templateChargeAnswer(intent, facts), summary };
    if (intent === "offTopic") return { lineId, kind: "redirect" as const, source: "template" as const, answer: templateChargeAnswer(intent, facts) };

    const ai = this.coach.answerCharge ? await this.coach.answerCharge({ facts, question }).catch(() => null) : null;
    const usable = ai !== null && figuresComeFromFacts(ai, facts) && !/\b(i will|i'll|we will|we'll) file\b|i-?file (ko|namin)/i.test(ai);
    return {
      lineId,
      kind: (intent === "correct" && facts.billCheck === "red" ? "askMeralco" : "answer") as "askMeralco" | "answer",
      source: usable ? ("ai" as const) : ("template" as const),
      answer: usable ? ai : templateChargeAnswer(intent, facts),
      ...(intent === "correct" && facts.billCheck === "red" ? { summary } : {}),
    };
  }
}

@Controller("households/:sin/charges")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class ChargeChatController {
  constructor(private readonly chat: ChargeChatService) {}

  @Post(":lineId/ask")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  ask(@Param("sin") sin: string, @Param("lineId") lineId: string, @Body() body: AskChargeDto) {
    return this.chat.ask(sin, lineId, body.question);
  }
}

@Module({
  imports: [HouseholdsModule, BillsModule, BillChecksModule, CoachModule],
  controllers: [ChargeChatController],
  providers: [ChargeChatService],
})
export class ChargeChatModule {}
