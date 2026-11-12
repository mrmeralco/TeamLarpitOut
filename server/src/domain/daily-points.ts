/**
 * Daily Verified Savings for smart meter Households (ADR-0008).
 *
 * Each complete Asia/Manila day after the household started Missions is compared
 * with what it would be expected to use at that day's heat. The expectation is
 * learned from the complete days before Missions started (kWh per day against
 * cooling degree days), so a hot day raises it and a cool day lowers it.
 * Savings are priced at the per-kWh rates of the latest Bill's Rate Schedule.
 * 1 point = ₱1. Days with a recorded outage earn nothing. The Bill gives smart
 * meter Households no Points; traditional Households keep earning at the Bill.
 */
import { calculateHeatSensitivity, predictKwhPerDay, type HeatSensitivityResult } from "./heat-sensitivity.js";
import { DAY_MS, HOUR_MS } from "./meter-reading.js";
import { pointsFromSavings } from "./points.js";

/** Same base temperature as the monthly weather provider. */
export const CDD_BASE_C = 22;
/** Days before Missions started that define the household's usual use. */
export const REFERENCE_DAYS = 28;
/** With fewer complete reference days than this, no daily Points are given yet. */
export const MIN_REFERENCE_DAYS = 7;

const MANILA_OFFSET_MS = 8 * HOUR_MS;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** The Asia/Manila calendar date (YYYY-MM-DD) of a timestamp. */
export const manilaDate = (timestamp: number) => new Date(timestamp + MANILA_OFFSET_MS).toISOString().slice(0, 10);
/** The instant a Manila calendar date starts, as an ISO timestamp. */
export const manilaDayStart = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - MANILA_OFFSET_MS).toISOString();
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Every date in [from, to). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let date = from; date < to; date = addDays(date, 1)) out.push(date);
  return out;
}

export const cddOf = (temperatureC: number) => Math.max(0, temperatureC - CDD_BASE_C);

/** One complete day of smart meter use and its heat. */
export interface DayUsage {
  date: string;
  kwh: number;
  temperatureC: number;
}

/** The household's usual daily use against heat, or null while there are too few reference days. */
export function dailyReference(days: DayUsage[]): HeatSensitivityResult | null {
  if (days.length < MIN_REFERENCE_DAYS) return null;
  return calculateHeatSensitivity(days.map((d) => ({ kwh: d.kwh, billingDays: 1, cddPerDay: cddOf(d.temperatureC) })));
}

export interface DailySavingsInput {
  day: DayUsage;
  reference: HeatSensitivityResult;
  /** Pesos per kWh: the sum of the Rate Schedule's per-kWh charges. */
  perKwhRate: number;
  hasOutage: boolean;
}

export interface DailySavingsResult {
  date: string;
  baselineKwh: number;
  actualKwh: number;
  savedKwh: number;
  /** Centavos. */
  savedPesos: number;
  points: number;
  hasOutage: boolean;
  excludedReason: string | null;
}

export function computeDailySavings(input: DailySavingsInput): DailySavingsResult {
  const baselineKwh = predictKwhPerDay(input.reference, cddOf(input.day.temperatureC));
  const actualKwh = round2(input.day.kwh);
  const base = { date: input.day.date, baselineKwh, actualKwh };
  if (input.hasOutage) {
    return {
      ...base,
      savedKwh: 0,
      savedPesos: 0,
      points: 0,
      hasOutage: true,
      excludedReason: "An outage/brownout was recorded on this day, so it does not qualify for Points.",
    };
  }
  const savedKwh = Math.max(0, round2(baselineKwh - actualKwh));
  const savedPesos = Math.round(savedKwh * input.perKwhRate * 100);
  return { ...base, savedKwh, savedPesos, points: pointsFromSavings(savedPesos), hasOutage: false, excludedReason: null };
}
