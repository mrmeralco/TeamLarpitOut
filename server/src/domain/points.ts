/**
 * Verified Savings and Points (GLOSSARY & KuryenteKo §2.6).
 *
 * Points are not easy on purpose, so a typical home earns an average amount, not everything:
 * - 1 point per ₱2 saved (PESOS_PER_POINT).
 * - A noise band of 1% of the Baseline is not counted: the lowest average saving measured in
 *   large home-energy-report programs (about 1.2%; ~2% in the early 600,000-home Opower
 *   evaluation), so smaller drops can't be told apart from normal month-to-month change.
 * - Savings count in full up to the 5% goal, at half rate beyond it, and not past twice the goal.
 * - The period's climate multiplier (domain/climate.ts): very strong El Niño ×1.3, El Niño ×1.15,
 *   normal ×1, La Niña ×0.9.
 * Traditional: at the next Bill, points = cost(baseline) - cost(actual) if positive,
 * with the Baseline adjusted for weather and billing days.
 * Never self-reported: tapping "done" earns nothing.
 * Brownouts excluded: days or periods with a recorded outage don't count.
 */
import type { Bill } from "./bill.js";
import { baseline } from "./baseline.js";
import { cost, type RateSchedule } from "./rate-schedule.js";

export const PESOS_PER_POINT = 2;
/** Share of the Baseline's cost that is not counted (normal variation). */
export const NOISE_BAND = 0.01;
/** Savings beyond the goal earn this share. */
export const OVER_GOAL_RATE = 0.5;
/** Savings past this many times the goal earn nothing more. */
export const CAP_GOALS = 2;

export interface PointsBreakdown {
  /** Centavos not counted as normal variation. */
  noiseBand: number;
  /** Centavos counted in full (up to the goal). */
  inGoal: number;
  /** Centavos counted at half rate (goal to the cap). */
  overGoal: number;
  multiplier: number;
  points: number;
}

/** Points for a period's savings (centavos), after the noise band, goal cap and climate multiplier. */
export function earnedPoints(input: { savedCentavos: number; baselineCentavos: number; goalCut?: number; multiplier?: number; hasOutage?: boolean }): PointsBreakdown {
  const multiplier = input.multiplier ?? 1;
  const noiseBand = Math.round(Math.max(0, input.baselineCentavos) * NOISE_BAND);
  const goal = Math.max(0, input.baselineCentavos) * ((input.goalCut ?? 5) / 100);
  if (input.hasOutage || input.savedCentavos <= 0) return { noiseBand, inGoal: 0, overGoal: 0, multiplier, points: 0 };
  const counted = Math.max(0, input.savedCentavos - noiseBand);
  const inGoal = Math.min(counted, goal);
  const overGoal = Math.min(Math.max(0, counted - goal), goal * (CAP_GOALS - 1));
  const pesos = (inGoal + overGoal * OVER_GOAL_RATE) / 100;
  return { noiseBand, inGoal: Math.round(inGoal), overGoal: Math.round(overGoal), multiplier, points: Math.floor((pesos / PESOS_PER_POINT) * multiplier) };
}

export interface VerifiedSavingsInput {
  previousBill: Bill;
  actualBill: Bill;
  schedule: RateSchedule;
  heatSensitivity: number;
  cddPerDayPrevious: number | null;
  cddPerDayActual: number | null;
  hasOutage?: boolean;
  /** The period's climate multiplier (domain/climate.ts); 1 when absent. */
  multiplier?: number;
  goalCut?: number;
}

export interface VerifiedSavingsResult {
  period: string;
  baselineKwh: number;
  actualKwh: number;
  baselinePesos: number; // centavos
  actualPesos: number; // centavos
  savedKwh: number;
  savedPesos: number; // centavos
  points: number;
  hasOutage: boolean;
  excludedReason: string | null;
  breakdown: PointsBreakdown;
}


export function computeVerifiedSavings(input: VerifiedSavingsInput): VerifiedSavingsResult {
  const base = baseline({
    lastKwh: input.previousBill.kwh,
    lastBillingDays: input.previousBill.billingDays,
    nextBillingDays: input.actualBill.billingDays,
    heatSensitivity: input.heatSensitivity,
    cddPerDayLast: input.cddPerDayPrevious,
    cddPerDayNext: input.cddPerDayActual,
  });

  const opts = { lifelineEligible: input.actualBill.lifelineEligible };
  const baselinePesos = cost(base.kwh, input.actualBill.billingDays, input.schedule, opts);
  const actualPesos = cost(input.actualBill.kwh, input.actualBill.billingDays, input.schedule, opts);
  const rawSavedCentavos = baselinePesos - actualPesos;
  const rawSavedKwh = base.kwh - input.actualBill.kwh;

  if (input.hasOutage) {
    return {
      period: input.actualBill.period,
      baselineKwh: Math.round(base.kwh * 100) / 100,
      actualKwh: input.actualBill.kwh,
      baselinePesos,
      actualPesos,
      savedKwh: 0,
      savedPesos: 0,
      points: 0,
      hasOutage: true,
      excludedReason: "An outage/brownout was recorded in this period, so it does not qualify for Points.",
      breakdown: earnedPoints({ savedCentavos: 0, baselineCentavos: baselinePesos, multiplier: input.multiplier, hasOutage: true }),
    };
  }

  const savedPesos = Math.max(0, rawSavedCentavos);
  const savedKwh = Math.max(0, Math.round(rawSavedKwh * 100) / 100);
  const breakdown = earnedPoints({ savedCentavos: savedPesos, baselineCentavos: baselinePesos, goalCut: input.goalCut, multiplier: input.multiplier });
  const points = breakdown.points;

  return {
    period: input.actualBill.period,
    baselineKwh: Math.round(base.kwh * 100) / 100,
    actualKwh: input.actualBill.kwh,
    baselinePesos,
    actualPesos,
    savedKwh,
    savedPesos,
    points,
    hasOutage: false,
    excludedReason: null,
    breakdown,
  };
}
