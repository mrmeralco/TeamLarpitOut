import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Bill, PaymentRecord } from "../domain/bill.js";
import { runBillChecks, type BillChecksResult, type BillCheckOptions } from "../domain/bill-checks.js";
import { calculateHeatSensitivity, predictKwhPerDay } from "../domain/heat-sensitivity.js";
import type { RateScheduleTable } from "../domain/rate-schedule.js";
import type { BillSource } from "../bills/bill-source.js";
import { BILL_SOURCE, RATE_SCHEDULES, WEATHER_PROVIDER } from "../common/injection-tokens.js";
import type { WeatherProvider } from "../weather/weather-provider.interface.js";
import { HouseholdsService } from "../households/households.service.js";

@Injectable()
export class BillChecksService {
  constructor(
    @Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable,
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
    @Inject(WEATHER_PROVIDER) private readonly weather: WeatherProvider,
    private readonly households: HouseholdsService,
  ) {}

  check(
    now: Bill,
    before?: Bill,
    options?: BillCheckOptions,
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

    const changes = await this.households.getChanges(sin);
    const hasHouseholdChange = changes.some((c) => !c.period || c.period === now.period);

    let predictedDailyKwh: number | undefined;
    try {
      const billsWithWeather = await Promise.all(
        list.map(async (b) => {
          const cdd = await this.weather.getCddPerDay(b.period);
          return {
            period: b.period,
            kwh: b.kwh,
            billingDays: b.billingDays,
            cddPerDay: cdd ?? -1,
          };
        }),
      );
      const sensitivity = calculateHeatSensitivity(billsWithWeather);
      const cddNow = await this.weather.getCddPerDay(now.period);
      if (cddNow !== null) {
        const fallbackBase = before ? before.kwh / before.billingDays : now.kwh / now.billingDays;
        predictedDailyKwh = predictKwhPerDay(sensitivity, cddNow, fallbackBase);
      }
    } catch {
      // Weather or prediction error should not block running the checks
    }

    return runBillChecks(now, before, this.rates, {
      ...options,
      householdSin: sin,
      predictedDailyKwh,
      hasHouseholdChange,
    });
  }
}
