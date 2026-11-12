import type { Bill } from "./bill.js";
import { baseCost, lifelineDiscount, type Centavos, type RateSchedule } from "./rate-schedule.js";

export interface WeatherInput {
  /** Heat Sensitivity: extra kWh per day per cooling degree day. */
  heatSensitivity: number;
  cddPerDayBefore: number;
  cddPerDayNow: number;
}

/** No Heat Sensitivity yet (ticket 04): Weather Effect is 0. */
export const NO_WEATHER: WeatherInput = { heatSensitivity: 0, cddPerDayBefore: 0, cddPerDayNow: 0 };

export interface BillChange {
  /** cost(now) − cost(before): the four effects plus lifeline and catch-up add up to it exactly. */
  total: Centavos;
  rateEffect: Centavos;
  billingDaysEffect: Centavos;
  weatherEffect: Centavos;
  habitEffect: Centavos;
  /** Change in the lifeline discount: negative when gained or grown, positive when lost. */
  lifelineEffect: Centavos;
  /** True when either Bill got a lifeline discount, so the line applies. */
  lifelineApplies: boolean;
  lifelineBefore: Centavos;
  lifelineNow: Centavos;
  /** Cost of last month's estimate being corrected on this Bill. */
  catchUpEffect: Centavos;
  /** True when the previous Bill was estimated and this one was read. */
  catchUpApplies: boolean;
  /** kWh on this Bill that belong to last month (negative if last month was overestimated). */
  catchUpKwh: number;
  costBefore: Centavos;
  costNow: Centavos;
}

/**
 * Split the Bill Change by swapping one input at a time (ADR-0001).
 *
 * - Lifeline: the four effects use cost before the discount; the change in
 *   the discount is its own line.
 * - Catch-up: when last month was estimated, the two months' kWh are split by
 *   billing days; the four effects compare those, and the correction of last
 *   month's estimate is its own line.
 *
 * Exact by construction: everything telescopes to cost(now) − cost(before).
 */
export function splitBillChange(
  before: Bill,
  now: Bill,
  schedBefore: RateSchedule,
  schedNow: RateSchedule,
  weather: WeatherInput = NO_WEATHER,
): BillChange {
  // Catch-up: re-split the two months' kWh when last month was estimated.
  const catchUpApplies = Boolean(before.estimated) && !now.estimated;
  let kwhBefore = before.kwh;
  let kwhNow = now.kwh;
  if (catchUpApplies) {
    const both = before.kwh + now.kwh;
    kwhBefore = (both * before.billingDays) / (before.billingDays + now.billingDays);
    kwhNow = both - kwhBefore;
  }

  // Four effects on cost before lifeline, between the (re-split) months.
  const costB = baseCost(kwhBefore, before.billingDays, schedBefore);
  const costN = baseCost(kwhNow, now.billingDays, schedNow);
  const nowAtOldRates = baseCost(kwhNow, now.billingDays, schedBefore);

  const kwhDaysOnly = (kwhBefore / before.billingDays) * now.billingDays;
  const kwhWeather =
    kwhDaysOnly +
    weather.heatSensitivity * (weather.cddPerDayNow - weather.cddPerDayBefore) * now.billingDays;

  const costDaysOnly = baseCost(kwhDaysOnly, now.billingDays, schedBefore);
  const costWeather = baseCost(kwhWeather, now.billingDays, schedBefore);

  // Catch-up: billed kWh vs. re-split kWh, on both Bills.
  const billedBaseBefore = baseCost(before.kwh, before.billingDays, schedBefore);
  const billedBaseNow = baseCost(now.kwh, now.billingDays, schedNow);
  const catchUpEffect = billedBaseNow - costN + (costB - billedBaseBefore);

  // Lifeline, on the billed kWh.
  const lifelineBefore = before.lifelineEligible ? lifelineDiscount(before.kwh, schedBefore) : 0;
  const lifelineNow = now.lifelineEligible ? lifelineDiscount(now.kwh, schedNow) : 0;

  const costBefore = billedBaseBefore - lifelineBefore;
  const costNow = billedBaseNow - lifelineNow;

  return {
    total: costNow - costBefore,
    rateEffect: costN - nowAtOldRates,
    billingDaysEffect: costDaysOnly - costB,
    weatherEffect: costWeather - costDaysOnly,
    habitEffect: nowAtOldRates - costWeather,
    lifelineEffect: lifelineBefore - lifelineNow,
    lifelineApplies: lifelineBefore > 0 || lifelineNow > 0,
    lifelineBefore,
    lifelineNow,
    catchUpEffect,
    catchUpApplies,
    catchUpKwh: now.kwh - kwhNow,
    costBefore,
    costNow,
  };
}
