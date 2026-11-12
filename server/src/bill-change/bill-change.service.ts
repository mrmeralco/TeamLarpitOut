import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { Bill } from "../domain/bill.js";
import { NO_WEATHER, splitBillChange, type WeatherInput } from "../domain/bill-change.js";
import { splitExtras } from "../domain/bill-extras.js";
import { calculateHeatSensitivity, DEFAULT_COOLING_SENSITIVITY, type HeatSensitivityResult } from "../domain/heat-sensitivity.js";
import { costLines, type RateSchedule, type RateScheduleTable } from "../domain/rate-schedule.js";
import type { BillSource } from "../bills/bill-source.js";
import { BILL_SOURCE, RATE_SCHEDULES, WEATHER_PROVIDER } from "../common/injection-tokens.js";
import type { WeatherProvider } from "../weather/weather-provider.interface.js";

/** "Bakit ganito?": the Bill Change split into four effects (ADR-0001). All amounts in centavos. */
@Injectable()
export class BillChangeService {
  constructor(
    @Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable,
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
    @Inject(WEATHER_PROVIDER) private readonly weather: WeatherProvider,
  ) {}

  async explainForHousehold(sin: string) {
    const bills = await this.bills.bills(sin);
    if (bills.length < 2) throw new NotFoundException({ error: "Kailangan ng dalawang Bill" });
    const [before, now] = bills.slice(-2) as [Bill, Bill];

    const billsWithWeather = await Promise.all(
      bills.map(async (b) => {
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
    const cddBefore = await this.weather.getCddPerDay(before.period);
    const cddNow = await this.weather.getCddPerDay(now.period);

    const weatherInput: WeatherInput =
      cddBefore !== null && cddNow !== null
        ? {
            heatSensitivity: sensitivity.heatSensitivity,
            cddPerDayBefore: cddBefore,
            cddPerDayNow: cddNow,
          }
        : NO_WEATHER;

    return this.explain(before, now, weatherInput, sensitivity);
  }

  async explainWithFallback(before: Bill, now: Bill) {
    const cddBefore = await this.weather.getCddPerDay(before.period);
    const cddNow = await this.weather.getCddPerDay(now.period);

    if (cddBefore !== null && cddNow !== null) {
      const fallbackSensitivity: HeatSensitivityResult = {
        heatSensitivity: DEFAULT_COOLING_SENSITIVITY,
        source: "cooling_appliance_estimate",
        label: "Cooling Appliance estimate",
        hotDayKwh: DEFAULT_COOLING_SENSITIVITY,
      };
      const weatherInput: WeatherInput = {
        heatSensitivity: fallbackSensitivity.heatSensitivity,
        cddPerDayBefore: cddBefore,
        cddPerDayNow: cddNow,
      };
      return this.explain(before, now, weatherInput, fallbackSensitivity);
    }

    return this.explain(before, now, NO_WEATHER);
  }

  explain(
    before: Bill,
    now: Bill,
    weather: WeatherInput = NO_WEATHER,
    sensitivity?: HeatSensitivityResult,
  ) {
    const schedBefore = this.schedule(before.period);
    const schedNow = this.schedule(now.period);
    const split = splitBillChange(before, now, schedBefore, schedNow, weather);

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
        {
          key: "weather",
          label: "Weather Effect (tantya)",
          amount: split.weatherEffect,
          estimate: true,
          sensitivity: sensitivity?.heatSensitivity,
          sensitivitySource: sensitivity?.source,
          sensitivityLabel: sensitivity?.label,
          hotDayKwh: sensitivity?.hotDayKwh,
        },
        { key: "habit", label: "Habit Effect", amount: split.habitEffect },
      ],
      weatherDetail: sensitivity
        ? {
            heatSensitivity: sensitivity.heatSensitivity,
            source: sensitivity.source,
            label: sensitivity.label,
            hotDayKwh: sensitivity.hotDayKwh,
            cddPerDayBefore: weather.cddPerDayBefore,
            cddPerDayNow: weather.cddPerDayNow,
          }
        : undefined,
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
