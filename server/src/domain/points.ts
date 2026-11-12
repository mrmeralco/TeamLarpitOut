/**
 * Verified Savings and Points (GLOSSARY & KuryenteKo §2.6).
 *
 * 1 point = ₱1 of Verified Savings.
 * Traditional: at the next Bill, points = cost(baseline) - cost(actual) if positive,
 * with the Baseline adjusted for weather and billing days.
 * Never self-reported: tapping "done" earns nothing.
 * Brownouts excluded: days or periods with a recorded outage don't count.
 */
import type { Bill } from "./bill.js";
import { baseline } from "./baseline.js";
import { cost, type RateSchedule } from "./rate-schedule.js";

export interface VerifiedSavingsInput {
  previousBill: Bill;
  actualBill: Bill;
  schedule: RateSchedule;
  heatSensitivity: number;
  cddPerDayPrevious: number | null;
  cddPerDayActual: number | null;
  hasOutage?: boolean;
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
}

export function pointsFromSavings(savedCentavos: number): number {
  if (savedCentavos <= 0) return 0;
  return Math.floor(savedCentavos / 100);
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
    };
  }

  const savedPesos = Math.max(0, rawSavedCentavos);
  const savedKwh = Math.max(0, Math.round(rawSavedKwh * 100) / 100);
  const points = pointsFromSavings(savedPesos);

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
  };
}
