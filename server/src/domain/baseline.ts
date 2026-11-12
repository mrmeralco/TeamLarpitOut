/**
 * Baseline and Target (GLOSSARY).
 *
 * Baseline: the kWh the household would be expected to use next billing
 * period, from the latest Bill's kWh per day adjusted for weather (Heat
 * Sensitivity × change in cooling degree days) and billing days.
 * Target: the Baseline reduced by a cut the household chooses.
 */

export const TARGET_CUTS = [5, 10, 15] as const;
export type TargetCut = (typeof TARGET_CUTS)[number];

export interface BaselineInput {
  lastKwh: number;
  lastBillingDays: number;
  nextBillingDays: number;
  /** kWh per day per cooling degree day. */
  heatSensitivity: number;
  /** CDD per day for the latest Bill's month and the next month; null when unknown. */
  cddPerDayLast: number | null;
  cddPerDayNext: number | null;
}

export interface Baseline {
  kwh: number;
  kwhPerDay: number;
  weatherAdjusted: boolean;
  /** kWh/day added (or removed) for the expected weather. */
  weatherKwhPerDay: number;
}

export function baseline(input: BaselineInput): Baseline {
  const perDay = input.lastKwh / input.lastBillingDays;
  const weatherAdjusted = input.cddPerDayLast !== null && input.cddPerDayNext !== null;
  const weatherKwhPerDay = weatherAdjusted
    ? input.heatSensitivity * (input.cddPerDayNext! - input.cddPerDayLast!)
    : 0;
  const kwhPerDay = Math.max(0, perDay + weatherKwhPerDay);
  return { kwh: kwhPerDay * input.nextBillingDays, kwhPerDay, weatherAdjusted, weatherKwhPerDay };
}

export function targetKwh(baselineKwh: number, cut: TargetCut): number {
  return baselineKwh * (1 - cut / 100);
}

/** "YYYY-MM" of the month after `period`. */
export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
