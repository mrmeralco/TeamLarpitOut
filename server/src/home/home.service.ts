import { HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { BillChangeService } from "../bill-change/bill-change.service.js";
import { BillChecksService } from "../bill-checks/bill-checks.service.js";
import type { BillSource } from "../bills/bill-source.js";
import { BILL_SOURCE } from "../common/injection-tokens.js";
import type { Bill } from "../domain/bill.js";
import { BADGE_LABEL, bakitGanitoSentence, homeAction, homeBadge } from "../domain/home-summary.js";
import { HouseholdsService } from "../households/households.service.js";

const MONTHS = ["Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo", "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"];
const monthName = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1] ?? period;

/** The amount due as Meralco printed it: the total, else the sum of the printed lines (centavos). */
function amountDue(bill: Bill): number | null {
  if (bill.totalAmount !== undefined) return Math.round(bill.totalAmount * 100);
  const lines = bill.chargeLines ?? [];
  return lines.length ? lines.reduce((s, l) => s + Math.round(l.amount * 100), 0) : null;
}

/** Home: pay-ready summary + "Bakit ganito? · Tama ba ito? · Ano ang gagawin ko?" */
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
    if (!latest) throw new NotFoundException({ error: "Walang Bill para sa Household na ito." });

    const checks = await this.billChecks.checkForHousehold(sin);
    const badge = homeBadge({ checksOverall: checks.overall });

    let bakitGanito: { sentence: string; total: number; screen: "bakit-ganito" } | null = null;
    let bakitGanitoUnavailable: string | null = history.length < 2 ? "Kailangan ng dalawang Bill para maikumpara." : null;
    if (history.length >= 2) {
      try {
        const change = await this.billChange.explainForHousehold(sin);
        const parts = [...change.effects, ...change.lines].map((p) => ({ key: p.key, amount: p.amount }));
        bakitGanito = {
          sentence: bakitGanitoSentence(change.total, parts, monthName(history.at(-2)!.period)),
          total: change.total,
          screen: "bakit-ganito",
        };
      } catch (err) {
        if (!(err instanceof HttpException)) throw err;
        bakitGanitoUnavailable = "Hindi pa maipaliwanag ang pagbabago ng Bill na ito.";
      }
    }

    return {
      currency: "PHP-centavos",
      meterType: household.meter_type,
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
      /** Smart meter extras ("Ngayong buwan hanggang ngayon") arrive with the smart meter readings (#10). */
      smartMeter: household.meter_type === "smart" ? { monthToDateKwh: null } : null,
    };
  }
}
