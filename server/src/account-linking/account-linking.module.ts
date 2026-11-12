import { BadRequestException, Body, Controller, Header, HttpCode, Inject, Injectable, Module, NotFoundException, Post, Req, UseGuards } from "@nestjs/common";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import type { BillSource } from "../bills/bill-source.js";
import { BillsModule } from "../bills/bills.module.js";
import type { MeralcoAccount, MeralcoAccountSource } from "../bills/meralco-accounts.js";
import { BILL_SOURCE, HOUSEHOLD_LINKS, MERALCO_ACCOUNTS } from "../common/injection-tokens.js";
import type { HouseholdLinkRepository } from "../households/household-link.repository.js";
import { HouseholdsModule } from "../households/households.module.js";
import { maskCan } from "../households/households.service.js";
import { ScanContextModule } from "../vision/scan-context.module.js";
import { ScanContextStore, tenDigits } from "../vision/scan-context.store.js";
import { ConfirmLinkDto } from "./dto/link-household.dto.js";
import { demoHistory, type ScannedBill } from "../domain/demo-history.js";

/** Demo Households get their own Service ID Number, made from the scanned CAN (never a demo account's). */
export const demoSinFor = (can: string) => `8${can.slice(1)}`;

/** What the scanned Bill's CAN points to, before anything is linked. */
export type ScannedAccount =
  | { status: "found"; canMasked: string; area: string; meterType: MeralcoAccount["meter_type"]; billsOnRecord: number; firstPeriod: string | null; lastPeriod: string | null; demo?: true }
  | { status: "alreadyLinked"; canMasked: string; householdSin: string; area: string; meterType: MeralcoAccount["meter_type"]; billsOnRecord: number; firstPeriod: string | null; lastPeriod: string | null; demo?: true }
  | { status: "canUnread" }
  | { status: "unknownAccount"; canMasked: string };

/**
 * Account Linking without a CAN screen: the scan reads the CAN from the Bill (the Bill
 * in hand is the ownership check) and "Yes, explain my bill" links it.
 */
@Injectable()
export class AccountLinkingService {
  constructor(
    @Inject(MERALCO_ACCOUNTS) private readonly meralco: MeralcoAccountSource,
    @Inject(HOUSEHOLD_LINKS) private readonly links: HouseholdLinkRepository,
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
  ) {}

  /** Area, Meter Type and how many Bills are on record. Never amounts, kWh or the address. */
  private async summary(account: MeralcoAccount) {
    let periods: string[] = [];
    try {
      periods = (await this.bills.bills(account.sin)).map((b) => b.period).sort().slice(-12);
    } catch {
      periods = [];
    }
    return {
      canMasked: maskCan(account.can),
      area: account.area,
      meterType: account.meter_type,
      billsOnRecord: periods.length,
      firstPeriod: periods[0] ?? null,
      lastPeriod: periods.at(-1) ?? null,
    };
  }

  /**
   * Demo fallback: in demo/test mode (AUTH_FIXED_CODE set), a CAN that isn't in the mock
   * Meralco data gets a demo Household built on the sample one (DEMO_FALLBACK_SIN, default the
   * Caloocan one), so a real Bill can be scanned during testing. Several logins may share it.
   */
  private async demoFallback(): Promise<MeralcoAccount | null> {
    if (!process.env.AUTH_FIXED_CODE) return null;
    return this.meralco.household(process.env.DEMO_FALLBACK_SIN ?? "1234567890");
  }

  async preview(ownerId: string, can: string | null): Promise<ScannedAccount> {
    if (can === null) return { status: "canUnread" };
    const account = await this.meralco.findByCan(can);
    if (!account || account.demo) {
      const sample = account ?? await this.demoFallback();
      if (!sample) return { status: "unknownAccount", canMasked: maskCan(can) };
      const linked = (await this.links.forOwner(ownerId)).some((l) => l.sin === sample.sin && l.status === "active");
      const summary = { ...(await this.summary(sample)), canMasked: maskCan(can), demo: true as const };
      return linked ? { status: "alreadyLinked", householdSin: sample.sin, ...summary } : { status: "found", ...summary };
    }
    // Any number of logins may link the same Household; "alreadyLinked" means this login has it.
    const linked = (await this.links.forOwner(ownerId)).some((l) => l.sin === account.sin && l.status === "active");
    const summary = await this.summary(account);
    return linked ? { status: "alreadyLinked", householdSin: account.sin, ...summary } : { status: "found", ...summary };
  }

  /** `scanned` is the confirmed Bill; only a demo Household uses it (as its latest Bill). */
  async link(ownerId: string, can: string, scanned: ScannedBill = {}) {
    const account = await this.meralco.findByCan(can);
    if (!account || account.demo) {
      const sample = await this.demoFallback();
      if (sample) {
        const sin = await this.demoHousehold(can, sample, scanned);
        await this.links.save({ ownerId, sin, can, status: "active" });
        return { status: "active" as const, householdSin: sin, canMasked: maskCan(can), demo: true as const };
      }
    }
    if (!account) throw new NotFoundException({ error: "No Meralco account has this CAN. Please check your Bill again.", reason: "unknownAccount" });
    await this.links.save({ ownerId, sin: account.sin, can: account.can, status: "active" });
    return { status: "active" as const, householdSin: account.sin, canMasked: maskCan(account.can) };
  }

  /**
   * The demo Household for a scanned CAN: the scanned Bill is its latest Bill, and the sample
   * Household's earlier Bills fill the months before it. Re-confirming a newer scan rebuilds it.
   * Sources that can't store demo Households fall back to sharing the sample Household.
   */
  private async demoHousehold(can: string, sample: MeralcoAccount, scanned: ScannedBill): Promise<string> {
    if (!this.meralco.addDemo || !this.bills.setBills) return sample.sin;
    const sin = demoSinFor(can);
    await this.meralco.addDemo({ can, sin, area: sample.area, meter_type: sample.meter_type });
    await this.bills.setBills(sin, demoHistory(await this.bills.bills(sample.sin), scanned));
    return sin;
  }
}

@Controller("households/link")
@UseGuards(SessionGuard)
export class AccountLinkingController {
  constructor(private readonly linking: AccountLinkingService, private readonly contexts: ScanContextStore) {}

  /**
   * "Yes, explain my bill": links the CAN the scan read. Only when the scan could not
   * read it is the CAN typed from the same Bill accepted.
   */
  @Post("confirm")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async confirm(@Body() body: ConfirmLinkDto, @Req() request: AuthenticatedRequest) {
    const scanned = this.contexts.context(body.scanToken);
    const can = scanned.can ?? (body.can !== undefined ? tenDigits(body.can) : null);
    if (can === null) throw new BadRequestException({ error: "Type the 10-digit CAN printed on the Bill.", reason: "canRequired" });
    const corrections = Object.fromEntries(
      (["kwh", "billingDays", "totalAmount"] as const).filter((k) => body[k] !== undefined).map((k) => [k, body[k]]),
    );
    return this.linking.link(request.auth.ownerId, can, { ...scanned.bill, ...corrections });
  }
}

@Module({
  imports: [HouseholdsModule, BillsModule, ScanContextModule],
  controllers: [AccountLinkingController],
  providers: [AccountLinkingService],
  exports: [AccountLinkingService],
})
export class AccountLinkingModule {}
