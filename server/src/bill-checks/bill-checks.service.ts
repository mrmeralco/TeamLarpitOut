import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Bill, PaymentRecord } from "../domain/bill.js";
import { runBillChecks, type BillChecksResult, type BillCheckOptions } from "../domain/bill-checks.js";
import type { RateScheduleTable } from "../domain/rate-schedule.js";
import type { BillSource } from "../bills/bill-source.js";
import { BILL_SOURCE, RATE_SCHEDULES } from "../common/injection-tokens.js";

@Injectable()
export class BillChecksService {
  constructor(
    @Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable,
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
  ) {}

  check(
    now: Bill,
    before?: Bill,
    options?: { tolerancePesos?: number; payments?: PaymentRecord[]; householdSin?: string },
  ): BillChecksResult {
    return runBillChecks(now, before, this.rates, options);
  }

  async checkForHousehold(
    sin: string,
    options?: { tolerancePesos?: number; payments?: PaymentRecord[] },
  ): Promise<BillChecksResult> {
    const list = await this.bills.bills(sin);
    if (!list || list.length === 0) {
      throw new NotFoundException({ error: "Walang nahanap na Bill para sa household na ito" });
    }

    const now = list.at(-1)!;
    const before = list.length >= 2 ? list.at(-2) : undefined;

    return runBillChecks(now, before, this.rates, {
      ...options,
      householdSin: sin,
    });
  }
}
