import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { Bill } from "../domain/bill.js";
import { splitBillChange } from "../domain/billChange.js";
import { splitExtras } from "../domain/extras.js";
import { costLines, type RateSchedule, type RateScheduleTable } from "../domain/rateSchedule.js";
import type { BillSource } from "../sources/billSource.js";
import { BILL_SOURCE, RATE_SCHEDULES } from "../tokens.js";

/** "Bakit ganito?": the Bill Change split into four effects (ADR-0001). All amounts in centavos. */
@Injectable()
export class BakitGanitoService {
  constructor(
    @Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable,
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
  ) {}

  async forHousehold(sin: string) {
    const bills = await this.bills.bills(sin);
    if (bills.length < 2) throw new NotFoundException({ error: "Kailangan ng dalawang Bill" });
    const [before, now] = bills.slice(-2) as [Bill, Bill];
    return this.decode(before, now);
  }

  decode(before: Bill, now: Bill) {
    const schedBefore = this.schedule(before.period);
    const schedNow = this.schedule(now.period);
    const split = splitBillChange(before, now, schedBefore, schedNow);

    const side = (bill: Bill, sched: RateSchedule, rebuilt: number, lifeline: number) => {
      const printed = splitExtras(bill.chargeLines);
      const hasLines = (bill.chargeLines ?? []).length > 0;
      return {
        period: bill.period,
        kwh: bill.kwh,
        billingDays: bill.billingDays,
        estimated: Boolean(bill.estimated),
        rebuiltTotal: rebuilt,
        /** Every printed line, extras included; null when no lines were given. */
        printedTotal: hasLines ? printed.charges + printed.extrasTotal : null,
        lines: [
          ...costLines(bill.kwh, bill.billingDays, sched),
          ...(lifeline > 0 ? [{ code: "lifeline", label: "Lifeline Discount", kind: "perKwh" as const, amount: -lifeline }] : []),
        ],
        /** Credits, refunds, adjustments, balances: not part of the four effects. */
        extras: printed.extras,
        extrasTotal: printed.extrasTotal,
        hasLines,
      };
    };
    const b = side(before, schedBefore, split.costBefore, split.lifelineBefore);
    const n = side(now, schedNow, split.costNow, split.lifelineNow);

    const lines = [];
    if (split.lifelineApplies) {
      const status =
        split.lifelineBefore === 0 ? "gained" : split.lifelineNow === 0 ? "lost" : "changed";
      lines.push({ key: "lifeline", label: "Lifeline discount", amount: split.lifelineEffect, status });
    }
    if (split.catchUpApplies) {
      lines.push({
        key: "catchUp",
        label: "Catch-up mula sa tantyang Bill",
        amount: split.catchUpEffect,
        kwh: Math.round(split.catchUpKwh * 100) / 100,
      });
    }

    const printedChange = b.printedTotal !== null && n.printedTotal !== null ? n.printedTotal - b.printedTotal : null;
    const extrasChange = n.extrasTotal - b.extrasTotal;

    const { hasLines: _b, ...before_ } = b;
    const { hasLines: _n, ...now_ } = n;
    return {
      currency: "PHP-centavos",
      before: before_,
      now: now_,
      effects: [
        { key: "rate", label: "Rate Effect", amount: split.rateEffect },
        { key: "billingDays", label: "Billing Days Effect", amount: split.billingDaysEffect },
        { key: "weather", label: "Weather Effect", amount: split.weatherEffect },
        { key: "habit", label: "Habit Effect", amount: split.habitEffect },
      ],
      /** Only the lines that apply: lifeline gained/lost/changed, catch-up after an estimated Bill. */
      lines,
      /** With an estimated previous Bill the two months are re-split, so habit can't be measured. */
      habitMeasurable: !split.catchUpApplies,
      /** cost(now) − cost(before) = effects + lines. */
      total: split.total,
      /** Change in the totals printed on the two Bills, when charge lines were typed. */
      printedChange,
      extrasChange,
      /**
       * printedChange = total + extrasChange + unexplained. A non-zero
       * unexplained is for the Bill Checks (#5); null without printed lines.
       */
      unexplained: printedChange === null ? null : printedChange - extrasChange - split.total,
    };
  }

  private schedule(period: string): RateSchedule {
    const s = this.rates.get(period);
    if (!s) throw new UnprocessableEntityException({ error: `Walang Rate Schedule para sa ${period}`, period });
    return s;
  }
}
