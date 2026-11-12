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
  source: SensitivitySource;
  label: string;
  hotDayKwh: number;
}

/** Baseline cooling sensitivity when no bill history is available (1.0 kWh/CDD). */
export const DEFAULT_COOLING_SENSITIVITY = 1.0;

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
    return {
      heatSensitivity: fallbackSensitivity,
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
    return {
      heatSensitivity: fallbackSensitivity,
      source: "cooling_appliance_estimate",
      label: "Cooling Appliance estimate",
      hotDayKwh: fallbackSensitivity,
    };
  }

  const slope = covXY / varX;
  // Energy consumption increases with heat, so sensitivity is non-negative.
  const clamped = Math.max(0, slope);
  const rounded = Math.round(clamped * 10) / 10;

  return {
    heatSensitivity: rounded,
    source: "history",
    label: "Mula sa Bill History",
    hotDayKwh: rounded,
  };
}
