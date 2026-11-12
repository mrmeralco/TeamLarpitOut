import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { Bill } from "../domain/bill.js";
import { splitBillChange } from "../domain/billChange.js";
import { costLines, type RateSchedule, type RateScheduleTable } from "../domain/rateSchedule.js";
import type { BillSource } from "../sources/billSource.js";
import { BILL_SOURCE, RATE_SCHEDULES } from "../tokens.js";

const toCentavos = (pesos: number) => Math.round(pesos * 100);

function printedTotal(bill: Bill): number | null {
  const lines = bill.chargeLines ?? [];
  return lines.length ? lines.reduce((s, l) => s + toCentavos(l.amount), 0) : null;
}

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

    const printedBefore = printedTotal(before);
    const printedNow = printedTotal(now);

    const side = (bill: Bill, sched: RateSchedule, rebuilt: number, printed: number | null) => ({
      period: bill.period,
      kwh: bill.kwh,
      billingDays: bill.billingDays,
      rebuiltTotal: rebuilt,
      printedTotal: printed,
      lines: costLines(bill.kwh, bill.billingDays, sched),
    });

    return {
      currency: "PHP-centavos",
      before: side(before, schedBefore, split.costBefore, printedBefore),
      now: side(now, schedNow, split.costNow, printedNow),
      effects: [
        { key: "rate", label: "Rate Effect", amount: split.rateEffect },
        { key: "billingDays", label: "Billing Days Effect", amount: split.billingDaysEffect },
        { key: "weather", label: "Weather Effect", amount: split.weatherEffect },
        { key: "habit", label: "Habit Effect", amount: split.habitEffect },
      ],
      total: split.total,
      /** Change in the totals printed on the two Bills, when charge lines were typed. */
      printedChange: printedBefore !== null && printedNow !== null ? printedNow - printedBefore : null,
    };
  }

  private schedule(period: string): RateSchedule {
    const s = this.rates.get(period);
    if (!s) throw new UnprocessableEntityException({ error: `Walang Rate Schedule para sa ${period}`, period });
    return s;
  }
}
