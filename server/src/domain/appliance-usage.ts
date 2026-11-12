import { findAppliance, UNKNOWN, type ApplianceType } from "./appliance-catalog.js";

/**
 * Appliance usage: routine → kWh per day, and "Saan napupunta?": every
 * appliance's share of the Bill, calibrated so the total equals the Bill's kWh.
 */

export type DaysOfWeek = "everyday" | "weekdays" | "weekends";

export interface TimeRange {
  /** "HH:MM", 24-hour. A range may cross midnight (22:00 → 06:00). */
  start: string;
  end: string;
  days: DaysOfWeek;
}

export interface ApplianceInput {
  type: ApplianceType;
  /** How many of this appliance run on the same routine. */
  quantity?: number;
  answers?: Record<string, string>;
  timeRanges?: TimeRange[];
  usesPerWeek?: number;
}

export type ApplianceSource = "answers" | "default";

export const SOURCE_LABEL: Record<ApplianceSource, string> = {
  answers: "Tantya mula sa sagot mo",
  default: "Hula (default)",
};

export interface ApplianceEstimate {
  /** kW, kWh per use, or kWh per day, depending on the routine. */
  rating: number;
  source: ApplianceSource;
  sourceLabel: string;
  /** Average hours per day (timeRanges) or uses per week (usesPerWeek); null when always on. */
  hoursPerDay: number | null;
  kwhPerDay: number;
}

const DAY_SHARE: Record<DaysOfWeek, number> = { everyday: 1, weekdays: 5 / 7, weekends: 2 / 7 };
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minutes = (t: string) => {
  const m = TIME.exec(t)!;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Average hours per day across the week for a set of time ranges. */
export function hoursPerDay(ranges: TimeRange[]): number {
  return ranges.reduce((sum, r) => {
    const length = (minutes(r.end) - minutes(r.start) + 1440) % 1440;
    return sum + (length / 60) * DAY_SHARE[r.days];
  }, 0);
}

/**
 * Create a standard daily time range yielding the given hours.
 * Starts at 22:00 (standard night cooling).
 */
export function rangeFromHours(hours: number, days: DaysOfWeek = "everyday"): TimeRange {
  const clamped = Math.max(1, Math.min(23, Math.round(hours)));
  const startHour = 22;
  const endHour = (startHour + clamped) % 24;
  return {
    start: "22:00",
    end: `${String(endHour).padStart(2, "0")}:00`,
    days,
  };
}

/** Problems with one appliance, in plain Tagalog; empty when valid. */
export function validateAppliance(a: ApplianceInput): string[] {
  const def = findAppliance(a.type);
  if (!def) return [`Hindi kilalang appliance: ${a.type}`];
  const errors: string[] = [];
  const quantity = a.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) errors.push(`${def.label}: 1 hanggang 20 lang ang bilang`);

  for (const [key, value] of Object.entries(a.answers ?? {})) {
    const q = def.questions.find((x) => x.key === key);
    if (!q) errors.push(`${def.label}: walang tanong na "${key}"`);
    else if (value !== UNKNOWN && !q.options.some((o) => o.value === value)) errors.push(`${def.label}: hindi tanggap ang sagot na "${value}" sa "${key}"`);
  }

  if (def.routine === "timeRanges") {
    const ranges = a.timeRanges ?? [];
    if (ranges.length === 0) errors.push(`${def.label}: kailan ito bukas?`);
    for (const r of ranges) {
      if (!TIME.test(r.start) || !TIME.test(r.end)) errors.push(`${def.label}: oras dapat HH:MM`);
      else if (r.start === r.end) errors.push(`${def.label}: magkaiba dapat ang simula at tapos`);
      if (!(r.days in DAY_SHARE)) errors.push(`${def.label}: araw dapat everyday, weekdays o weekends`);
    }
  }
  if (def.routine === "usesPerWeek") {
    const uses = a.usesPerWeek;
    if (uses === undefined || !Number.isFinite(uses) || uses < 0 || uses > 50) errors.push(`${def.label}: ilang beses kada linggo (0–50)?`);
  }
  return errors;
}

/** kWh per day for a valid appliance, with the source of its rating. */
export function estimateAppliance(a: ApplianceInput): ApplianceEstimate {
  const def = findAppliance(a.type)!;
  const answers = Object.fromEntries(def.questions.map((q) => [q.key, a.answers?.[q.key] ?? UNKNOWN]));
  const fromAnswers = def.questions.length > 0 ? def.rating(answers) : null;
  const source: ApplianceSource = fromAnswers === null ? "default" : "answers";
  const rating = fromAnswers ?? def.defaultRating;
  const quantity = a.quantity ?? 1;

  let perDay: number;
  let hours: number | null = null;
  if (def.routine === "alwaysOn") perDay = rating;
  else if (def.routine === "timeRanges") {
    hours = hoursPerDay(a.timeRanges ?? []);
    perDay = rating * hours;
  } else {
    hours = a.usesPerWeek ?? 0;
    perDay = (rating * hours) / 7;
  }
  return { rating, source, sourceLabel: SOURCE_LABEL[source], hoursPerDay: hours, kwhPerDay: perDay * quantity };
}

/**
 * Split an integer total across weights so the parts are integers that add up
 * exactly to the total (largest remainder). Zero weights get zero.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    parts[i]! += 1;
    left -= 1;
  }
  return parts;
}

export interface UsageRow {
  index: number;
  type: ApplianceType;
  quantity: number;
  source: ApplianceSource;
  sourceLabel: string;
  /** Before calibration: kWh/day × billing days. */
  estimatedKwh: number;
  /** Calibrated to the Bill, 2 decimals; all rows add up to the Bill's kWh. */
  kwh: number;
  /** Share of the per-kWh charges, in centavos; all rows add up to them. */
  pesos: number;
  share: number;
}

/**
 * "Saan napupunta?": scale the estimates so they add up to the Bill's kWh, and
 * split the Bill's per-kWh charges the same way. Errors in the estimates only
 * shift the split between appliances, never the total.
 */
export function calibrateToBill(
  estimates: ApplianceEstimate[],
  appliances: ApplianceInput[],
  bill: { kwh: number; billingDays: number },
  perKwhCharges: number,
): UsageRow[] {
  const estimated = estimates.map((e) => e.kwhPerDay * bill.billingDays);
  const hundredths = apportion(Math.round(bill.kwh * 100), estimated);
  const pesos = apportion(perKwhCharges, hundredths);
  const totalEstimate = estimated.reduce((s, x) => s + x, 0);
  return estimates.map((e, i) => ({
    index: i,
    type: appliances[i]!.type,
    quantity: appliances[i]!.quantity ?? 1,
    source: e.source,
    sourceLabel: e.sourceLabel,
    estimatedKwh: Math.round(estimated[i]! * 100) / 100,
    kwh: hundredths[i]! / 100,
    pesos: pesos[i]!,
    share: totalEstimate > 0 ? estimated[i]! / totalEstimate : 0,
  }));
}
