import type { Bill } from "./bill.js";
import { cost, type Centavos, type RateSchedule } from "./rateSchedule.js";

export interface WeatherInput {
  /** Heat Sensitivity: extra kWh per day per cooling degree day. */
  heatSensitivity: number;
  cddPerDayBefore: number;
  cddPerDayNow: number;
}

/** No Heat Sensitivity yet (ticket 04): Weather Effect is 0. */
export const NO_WEATHER: WeatherInput = { heatSensitivity: 0, cddPerDayBefore: 0, cddPerDayNow: 0 };

export interface BillChange {
  /** cost(now) − cost(before), the change the four effects add up to. */
  total: Centavos;
  rateEffect: Centavos;
  billingDaysEffect: Centavos;
  weatherEffect: Centavos;
  habitEffect: Centavos;
  costBefore: Centavos;
  costNow: Centavos;
}

/**
 * Split the Bill Change by swapping one input at a time (ADR-0001).
 * Exact by construction: the terms telescope to cost(now) − cost(before).
 */
export function splitBillChange(
  before: Bill,
  now: Bill,
  schedBefore: RateSchedule,
  schedNow: RateSchedule,
  weather: WeatherInput = NO_WEATHER,
): BillChange {
  const costBefore = cost(before.kwh, before.billingDays, schedBefore);
  const costNow = cost(now.kwh, now.billingDays, schedNow);
  const nowAtOldRates = cost(now.kwh, now.billingDays, schedBefore);

  const kwhDaysOnly = (before.kwh / before.billingDays) * now.billingDays;
  const kwhWeather =
    kwhDaysOnly +
    weather.heatSensitivity * (weather.cddPerDayNow - weather.cddPerDayBefore) * now.billingDays;

  const costDaysOnly = cost(kwhDaysOnly, now.billingDays, schedBefore);
  const costWeather = cost(kwhWeather, now.billingDays, schedBefore);

  return {
    total: costNow - costBefore,
    rateEffect: costNow - nowAtOldRates,
    billingDaysEffect: costDaysOnly - costBefore,
    weatherEffect: costWeather - costDaysOnly,
    habitEffect: nowAtOldRates - costWeather,
    costBefore,
    costNow,
  };
}
