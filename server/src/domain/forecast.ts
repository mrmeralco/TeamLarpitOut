/**
 * Forecast: projected next Bill (GLOSSARY / KuryenteKo §4).
 *
 * Before any reading: range = cost((predicted(cdd_forecast) ± sigma) * days_next)
 * After typed Mid-month Reading: projected = kwh_so_far + predicted(cdd_forecast_rest) * remaining_days
 * Heat wave banner when forecast heat index / CDD indicates extreme heat.
 */
import { cost, type RateSchedule } from "./rate-schedule.js";

const round2 = (x: number) => Math.round(x * 100) / 100;

export interface HeatWaveInfo {
  active: boolean;
  heatIndex: number | null;
  banner: string | null;
  kwhAdjustmentPerDay: number;
}

export interface ForecastRange {
  minKwh: number;
  maxKwh: number;
  minPesos: number;
  maxPesos: number;
}

export interface ForecastProjected {
  kwh: number;
  pesos: number;
  kwhSoFar: number;
  elapsedDays: number;
  remainingDays: number;
  reading: number;
  readingDate: string | null;
}

export interface TargetComparison {
  targetKwh: number;
  targetPesos: number;
  diffPesos: number;
  diffKwh: number;
  status: "within_target" | "over_target";
  label: string;
}

export function detectHeatWave(opts: {
  isHeatWave?: boolean;
  heatIndexMax?: number | null;
  cddForecast?: number;
  heatSensitivity?: number;
}): HeatWaveInfo {
  const isHeatWave = Boolean(
    opts.isHeatWave ||
    (opts.heatIndexMax !== undefined && opts.heatIndexMax !== null && opts.heatIndexMax >= 42) ||
    (opts.cddForecast !== undefined && opts.cddForecast >= 6.5),
  );
  const heatIndex = opts.heatIndexMax ?? (isHeatWave ? 42.5 : null);
  const sensitivity = opts.heatSensitivity ?? 1.0;
  const kwhAdjustmentPerDay = isHeatWave
    ? round2(Math.max(1.5, sensitivity * 1.5))
    : 0;

  const banner = isHeatWave
    ? heatIndex
      ? `Heat wave warning: the heat index is expected to reach ${heatIndex}°C in the next 14 days. Electricity use may go up.`
      : "Heat wave warning: a high heat index is expected in the next 14 days. Electricity use may go up."
    : null;

  return { active: isHeatWave, heatIndex, banner, kwhAdjustmentPerDay };
}

export function forecastRange(opts: {
  predictedKwhPerDay: number;
  sigma: number;
  billingDays: number;
  schedule: RateSchedule;
  lifelineEligible?: boolean;
}): ForecastRange {
  const { predictedKwhPerDay, sigma, billingDays, schedule, lifelineEligible } = opts;
  const effectiveSigma = sigma > 0 ? sigma : 1.0;
  const minDaily = Math.max(0, predictedKwhPerDay - effectiveSigma);
  const maxDaily = predictedKwhPerDay + effectiveSigma;
  const minKwh = round2(minDaily * billingDays);
  const maxKwh = round2(maxDaily * billingDays);
  const minPesos = cost(minKwh, billingDays, schedule, { lifelineEligible });
  const maxPesos = cost(maxKwh, billingDays, schedule, { lifelineEligible });
  return { minKwh, maxKwh, minPesos, maxPesos };
}

export function forecastSingle(opts: {
  kwhSoFar: number;
  remainingDays: number;
  predictedKwhPerDay: number;
  billingDays: number;
  schedule: RateSchedule;
  lifelineEligible?: boolean;
  reading: number;
  elapsedDays: number;
  readingDate?: string | null;
}): ForecastProjected {
  const { kwhSoFar, remainingDays, predictedKwhPerDay, billingDays, schedule, lifelineEligible, reading, elapsedDays, readingDate } = opts;
  const projectedKwh = round2(kwhSoFar + predictedKwhPerDay * remainingDays);
  const projectedPesos = cost(projectedKwh, billingDays, schedule, { lifelineEligible });
  return {
    kwh: projectedKwh,
    pesos: projectedPesos,
    kwhSoFar: round2(kwhSoFar),
    elapsedDays,
    remainingDays,
    reading,
    readingDate: readingDate ?? null,
  };
}

export function compareTarget(opts: {
  projectedPesos: number;
  projectedKwh: number;
  targetPesos: number;
  targetKwh: number;
}): TargetComparison {
  const { projectedPesos, projectedKwh, targetPesos, targetKwh } = opts;
  const diffPesos = projectedPesos - targetPesos;
  const diffKwh = round2(projectedKwh - targetKwh);
  const status: "within_target" | "over_target" = diffPesos <= 0 ? "within_target" : "over_target";
  const diffPesosNumber = Math.abs(diffPesos / 100);
  const formatted = diffPesosNumber.toFixed(2);
  const label = diffPesos <= 0
    ? (diffPesos === 0 ? "Exactly on target" : `Within target (₱${formatted} below)`)
    : `Over target by ₱${formatted}`;
  return { targetKwh, targetPesos, diffPesos, diffKwh, status, label };
}
