export interface BillWithWeather {
  period?: string;
  kwh: number;
  billingDays: number;
  cddPerDay: number;
}

export type SensitivitySource = "history" | "cooling_appliance_estimate";

export interface HeatSensitivityResult {
  /** Extra kWh per day per cooling degree day. */
  heatSensitivity: number;
  /** Baseline daily kWh when CDD = 0. */
  baseKwhPerDay: number;
  source: SensitivitySource;
  label: string;
  hotDayKwh: number;
}

/** Baseline cooling sensitivity when no bill history is available (1.0 kWh/CDD). */
export const DEFAULT_COOLING_SENSITIVITY = 1.0;

/**
 * Predict daily kWh given a learned or fallback HeatSensitivityResult and CDD/day.
 * predicted_kwh_per_day(cdd) = base + s * cdd
 */
export function predictKwhPerDay(
  sensitivity: HeatSensitivityResult,
  cddPerDay: number,
  fallbackBaseDailyKwh?: number,
): number {
  const base = sensitivity.baseKwhPerDay || fallbackBaseDailyKwh || 0;
  return Math.max(0, Math.round((base + sensitivity.heatSensitivity * Math.max(0, cddPerDay)) * 100) / 100);
}

/**
 * Learn heat sensitivity (slope of daily kWh vs CDD/day) from historical bills.
 * Falls back to Cooling Appliance estimate if history has fewer than 3 valid data points
 * or if there is no variance in CDD observations.
 */
export function calculateHeatSensitivity(
  history: BillWithWeather[],
  fallbackSensitivity = DEFAULT_COOLING_SENSITIVITY,
): HeatSensitivityResult {
  const valid = history.filter(
    (b) => b.billingDays > 0 && Number.isFinite(b.kwh) && Number.isFinite(b.cddPerDay) && b.cddPerDay >= 0,
  );

  if (valid.length < 3) {
    const meanDaily =
      valid.length > 0 ? valid.reduce((acc, b) => acc + b.kwh / b.billingDays, 0) / valid.length : 0;
    const base = Math.max(0, meanDaily - fallbackSensitivity * 0);
    return {
      heatSensitivity: fallbackSensitivity,
      baseKwhPerDay: Math.round(base * 100) / 100,
      source: "cooling_appliance_estimate",
      label: "Cooling Appliance estimate",
      hotDayKwh: fallbackSensitivity,
    };
  }

  // Ordinary Least Squares:
  // x = cddPerDay
  // y = daily kWh = kwh / billingDays
  const n = valid.length;
  let sumX = 0;
  let sumY = 0;
  for (const b of valid) {
    sumX += b.cddPerDay;
    sumY += b.kwh / b.billingDays;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let covXY = 0;
  let varX = 0;
  for (const b of valid) {
    const dx = b.cddPerDay - meanX;
    const dy = b.kwh / b.billingDays - meanY;
    covXY += dx * dy;
    varX += dx * dx;
  }

  // If there's no variation in CDD, slope is undefined; fall back to estimate.
  if (varX <= 1e-6) {
    const base = Math.max(0, meanY - fallbackSensitivity * meanX);
    return {
      heatSensitivity: fallbackSensitivity,
      baseKwhPerDay: Math.round(base * 100) / 100,
      source: "cooling_appliance_estimate",
      label: "Cooling Appliance estimate",
      hotDayKwh: fallbackSensitivity,
    };
  }

  const slope = covXY / varX;
  // Energy consumption increases with heat, so sensitivity is non-negative.
  const clamped = Math.max(0, slope);
  const rounded = Math.round(clamped * 10) / 10;
  const base = Math.max(0, meanY - rounded * meanX);

  return {
    heatSensitivity: rounded,
    baseKwhPerDay: Math.round(base * 100) / 100,
    source: "history",
    label: "Mula sa Bill History",
    hotDayKwh: rounded,
  };
}

/**
 * Estimate daily aircon hours from the cooling part of Heat Sensitivity divided
 * by the aircon's power rating in kW (kWh per hour).
 * Cooling kWh/day = mean daily kWh - baseKwhPerDay.
 */
export function estimateAirconHoursFromHistory(
  history: BillWithWeather[],
  airconKw: number,
): { hours: number; coolingKwhPerDay: number } | null {
  if (history.length < 3 || airconKw <= 0) return null;
  const sensitivity = calculateHeatSensitivity(history);
  if (sensitivity.source !== "history" || sensitivity.heatSensitivity <= 0) return null;

  const valid = history.filter(
    (b) => b.billingDays > 0 && Number.isFinite(b.kwh) && Number.isFinite(b.cddPerDay) && b.cddPerDay >= 0,
  );
  if (valid.length < 3) return null;

  const meanDaily = valid.reduce((acc, b) => acc + b.kwh / b.billingDays, 0) / valid.length;
  const coolingKwhPerDay = Math.max(0, meanDaily - sensitivity.baseKwhPerDay);
  if (coolingKwhPerDay <= 0) return null;

  const hours = Math.round(coolingKwhPerDay / airconKw);
  if (hours < 1 || hours > 24) return null;

  return { hours, coolingKwhPerDay: Math.round(coolingKwhPerDay * 100) / 100 };
}
