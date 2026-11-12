import { HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { BillChangeService } from "../bill-change/bill-change.service.js";
import { BillChecksService } from "../bill-checks/bill-checks.service.js";
import type { BillSource } from "../bills/bill-source.js";
import { BILL_SOURCE } from "../common/injection-tokens.js";
import type { Bill } from "../domain/bill.js";
import { BADGE_LABEL, bakitGanitoSentence, homeAction, homeBadge } from "../domain/home-summary.js";
import { homeChargeLines } from "../domain/charge-lines.js";
import { HouseholdsService } from "../households/households.service.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1] ?? period;

/** The amount due as Meralco printed it: the total, else the sum of the printed lines (centavos). */
function amountDue(bill: Bill): number | null {
  if (bill.totalAmount !== undefined) return Math.round(bill.totalAmount * 100);
  const lines = bill.chargeLines ?? [];
  return lines.length ? lines.reduce((s, l) => s + Math.round(l.amount * 100), 0) : null;
}

/** Home: pay-ready summary + "Why this bill? · Is it right? · What should I do?" */
@Injectable()
export class HomeService {
  constructor(
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
    private readonly households: HouseholdsService,
    private readonly billChecks: BillChecksService,
    private readonly billChange: BillChangeService,
  ) {}

  async summary(ownerId: string, sin: string) {
    const household = (await this.households.list(ownerId)).find((h) => h.sin === sin)!;
    const history = await this.bills.bills(sin);
    const latest = history.at(-1);
    if (!latest) throw new NotFoundException({ error: "There is no Bill for this Household." });

    const checks = await this.billChecks.checkForHousehold(sin);
    const badge = homeBadge({ checksOverall: checks.overall });

    let bakitGanito: {
      sentence: string;
      total: number;
      screen: "bakit-ganito";
      previousPeriod: string;
      /** Rate, Billing Days, Weather, Habit: they and `lines` add up to `total` exactly (ADR-0001). */
      effects: { key: string; label: string; amount: number }[];
      lines: { key: string; label: string; amount: number }[];
      addsUp: boolean;
      habit: number;
    } | null = null;
    let bakitGanitoUnavailable: string | null = history.length < 2 ? "Two Bills are needed to compare." : null;
    if (history.length >= 2) {
      try {
        const change = await this.billChange.explainForHousehold(sin);
        const parts = [...change.effects, ...change.lines].map((p) => ({ key: p.key, amount: p.amount }));
        const effects = change.effects.map((e) => ({ key: e.key, label: e.label, amount: e.amount }));
        const lines = change.lines.map((l) => ({ key: l.key, label: l.label, amount: l.amount }));
        bakitGanito = {
          sentence: bakitGanitoSentence(change.total, parts, monthName(history.at(-2)!.period)),
          total: change.total,
          screen: "bakit-ganito",
          previousPeriod: history.at(-2)!.period,
          effects,
          lines,
          addsUp: [...effects, ...lines].reduce((s, p) => s + p.amount, 0) === change.total,
          habit: effects.find((e) => e.key === "habit")?.amount ?? 0,
        };
      } catch (err) {
        if (!(err instanceof HttpException)) throw err;
        bakitGanitoUnavailable = "This Bill's change can't be explained yet.";
      }
    }

    const previous = history.at(-2);
    const charges = homeChargeLines(latest.chargeLines ?? [], previous?.chargeLines ?? []);

    return {
      currency: "PHP-centavos",
      meterType: household.meter_type,
      canMasked: await this.households.canMasked(ownerId, sin),
      area: household.masked_address.replace(/^•+\s*/, ""),
      /** Every printed line with a stable id, amount, change and who gets the money. */
      chargeLines: { featured: charges.featured, all: charges.all },
      bill: {
        period: latest.period,
        amountDue: amountDue(latest),
        dueDate: latest.dueDate ?? null,
        billDate: latest.billDate ?? null,
      },
      badge: { status: badge, label: BADGE_LABEL[badge] },
      bakitGanito,
      bakitGanitoUnavailable,
      tamaBa: {
        status: badge,
        label: BADGE_LABEL[badge],
        failedChecks: checks.failedChecks.length,
        summary: checks.summary,
        screen: "tama-ba" as const,
      },
      action: homeAction(badge, checks.summary),
      /** Smart meter extras ("This month so far") arrive with the smart meter readings (#10). */
      smartMeter: household.meter_type === "smart" ? { monthToDateKwh: null } : null,
    };
  }
}
