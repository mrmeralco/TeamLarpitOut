import type { TimeRange } from "./appliance-usage.js";
import { DAY_MS, HOUR_MS, type HourlyReading, type ReadingRange } from "./meter-reading.js";

/** Project heuristics for a tentative proposal, not appliance identification. */
export const AIRCON_PATTERN_RULES = {
  minNights: 7,
  minHours: 4,
  minStepRatio: 0.35,
  ratingTolerance: 0.3,
  minRecurrence: 0.7,
  minTemperatureSpanC: 1,
  minKwPerDegreeC: 0.02,
  minCorrelation: 0.5,
} as const;
const MANILA_OFFSET = 8 * HOUR_MS;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const localDate = (timestamp: number) => new Date(timestamp + MANILA_OFFSET).toISOString().slice(0, 10);

export interface PatternCoverage { completeNights: number; matchingNights: number; heatMatchedNights: number }
export type PatternFallbackReason = "insufficient-readings" | "no-matching-pattern" | "ambiguous-pattern"
  | "insufficient-weather" | "no-heat-association" | "weather-unavailable";
export type PatternAnalysis = { canPropose: false; reason: PatternFallbackReason; coverage: PatternCoverage } | {
  canPropose: true;
  routine: TimeRange;
  hours: number;
  stepKw: number;
  coverage: PatternCoverage;
  heat: { temperatureSpanC: number; kwPerDegreeC: number; correlation: number };
};
interface Night { start: number; end: number; stepKw: number; heat: number | null }

/** Rows must first pass the hourly source validation in aggregateReadings(). */
export function analyzeAirconPattern(
  rows: HourlyReading[], range: ReadingRange, expectedKw: number,
  weather: { date: string; temperatureC: number }[],
): PatternAnalysis {
  const coverage: PatternCoverage = { completeNights: 0, matchingNights: 0, heatMatchedNights: 0 };
  const fallback = (reason: PatternFallbackReason): PatternAnalysis => ({ canPropose: false, reason, coverage });
  if (!Number.isFinite(expectedKw) || expectedKw <= 0) return fallback("no-matching-pattern");
  const readings = new Map(rows.map((row) => [Date.parse(row.from), row.wh / 1000]));
  const temperatures = new Map(weather.map((day) => [day.date, day.temperatureC]));
  const nights: Night[] = [];
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const firstDay = Math.floor((from + MANILA_OFFSET) / DAY_MS) * DAY_MS - MANILA_OFFSET;
  for (let day = firstDay; day + 34 * HOUR_MS <= to; day += DAY_MS) {
    // A complete 10 AM–10 AM frame supplies daytime background and the whole night.
    const frame = Array.from({ length: 24 }, (_, i) => readings.get(day + (10 + i) * HOUR_MS));
    if (frame.some((value) => value === undefined)) continue;
    coverage.completeNights++;
    const background = median(frame.slice(0, 8) as number[]); // 10 AM–6 PM
    const excess = (frame.slice(8) as number[]).map((kw) => Math.max(0, kw - background)); // 6 PM–10 AM
    const runs: { start: number; end: number }[] = [];
    for (let i = 0; i < excess.length;) {
      if (excess[i]! < expectedKw * AIRCON_PATTERN_RULES.minStepRatio) { i++; continue; }
      const start = i;
      while (i < excess.length && excess[i]! >= expectedKw * AIRCON_PATTERN_RULES.minStepRatio) i++;
      if (i - start >= AIRCON_PATTERN_RULES.minHours) runs.push({ start, end: i });
    }
    // Multiple sustained steps, or a step clipped by the search window, are ambiguous.
    if (runs.length !== 1 || runs[0]!.start === 0 || runs[0]!.end === excess.length) continue;
    const run = runs[0]!;
    const plateau = excess.slice(run.start, run.end);
    const stepKw = median(plateau);
    const tolerance = AIRCON_PATTERN_RULES.ratingTolerance + 1e-9;
    if (Math.abs(stepKw / expectedKw - 1) > tolerance
      || plateau.some((kw) => Math.abs(kw / stepKw - 1) > tolerance)) continue;
    const start = 18 + run.start;
    const end = 18 + run.end;
    const heat = Array.from({ length: end - start }, (_, i) => temperatures.get(localDate(day + (start + i) * HOUR_MS)));
    nights.push({ start, end, stepKw,
      heat: heat.every((value) => value !== undefined && Number.isFinite(value))
        ? (heat as number[]).reduce((sum, value) => sum + value, 0) / heat.length : null });
  }
  if (coverage.completeNights < AIRCON_PATTERN_RULES.minNights) return fallback("insufficient-readings");
  const groups = new Map<string, Night[]>();
  for (const night of nights) {
    const key = `${night.start}:${night.end}`;
    const group = groups.get(key) ?? [];
    group.push(night);
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const group = ordered[0] ?? [];
  coverage.matchingNights = group.length;
  if (group.length < AIRCON_PATTERN_RULES.minNights) return fallback("no-matching-pattern");
  if (group.length / coverage.completeNights < AIRCON_PATTERN_RULES.minRecurrence) return fallback("ambiguous-pattern");
  const paired = group.filter((night): night is Night & { heat: number } => night.heat !== null);
  coverage.heatMatchedNights = paired.length;
  if (paired.length < AIRCON_PATTERN_RULES.minNights) return fallback("insufficient-weather");
  const heatValues = paired.map((night) => night.heat);
  const span = Math.max(...heatValues) - Math.min(...heatValues);
  const meanHeat = heatValues.reduce((a, b) => a + b, 0) / paired.length;
  const meanKw = paired.reduce((sum, night) => sum + night.stepKw, 0) / paired.length;
  let covariance = 0;
  let heatVariance = 0;
  let kwVariance = 0;
  for (const night of paired) {
    const heatDelta = night.heat - meanHeat;
    const kwDelta = night.stepKw - meanKw;
    covariance += heatDelta * kwDelta;
    heatVariance += heatDelta ** 2;
    kwVariance += kwDelta ** 2;
  }
  if (span + 1e-9 < AIRCON_PATTERN_RULES.minTemperatureSpanC || heatVariance === 0 || kwVariance === 0) {
    return fallback("no-heat-association");
  }
  const slope = covariance / heatVariance;
  const correlation = covariance / Math.sqrt(heatVariance * kwVariance);
  if (slope + 1e-9 < AIRCON_PATTERN_RULES.minKwPerDegreeC || correlation + 1e-9 < AIRCON_PATTERN_RULES.minCorrelation) {
    return fallback("no-heat-association");
  }
  const window = group[0]!;
  const time = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;
  return {
    canPropose: true,
    routine: { start: time(window.start), end: time(window.end), days: "everyday" },
    hours: window.end - window.start,
    stepKw: Math.round(median(group.map((night) => night.stepKw)) * 1000) / 1000,
    coverage,
    heat: { temperatureSpanC: span, kwPerDegreeC: slope, correlation },
  };
}
