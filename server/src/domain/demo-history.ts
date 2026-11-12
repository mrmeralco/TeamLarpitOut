import type { Bill } from "./bill.js";

/** "YYYY-MM" shifted by whole months. */
export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
};

/** "YYYY-MM-DD" shifted by whole months; the day is clamped to the target month's length. */
function shiftDate(date: string | undefined, months: number): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const period = shiftPeriod(date.slice(0, 7), months);
  const [y, m] = period.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(Math.min(Number(date.slice(8, 10)), lastDay)).padStart(2, "0")}`;
}

/** The fields a demo Household needs from the scanned Bill before it can be its latest Bill. */
export type ScannedBill = Partial<Bill>;
export const isCompleteScan = (b: ScannedBill): b is Bill & ScannedBill =>
  typeof b.period === "string" && typeof b.kwh === "number" && typeof b.billingDays === "number";

/**
 * Demo mode only: the History of a Household made for a scanned Bill whose CAN is not in the
 * mock Meralco data. The scanned Bill is the latest Bill; the 11 months before it are the sample
 * Household's Bills, moved to those months and still labelled with their sample provenance.
 * Without a usable scan (no period, kWh or billing days) the sample History is returned as is.
 */
export function demoHistory(sample: Bill[], scanned: ScannedBill): Bill[] {
  const sorted = [...sample].sort((a, b) => a.period.localeCompare(b.period));
  if (!isCompleteScan(scanned) || sorted.length === 0) return structuredClone(sorted);

  const earlier = sorted.slice(0, -1).slice(-11);
  const moved = earlier.map((bill, i) => {
    const period = shiftPeriod(scanned.period, i - earlier.length);
    const offset = monthsBetween(bill.period, period);
    return { ...structuredClone(bill), period, billDate: shiftDate(bill.billDate, offset), dueDate: shiftDate(bill.dueDate, offset) };
  });
  chainReadings(moved, scanned);
  const latest: Bill = {
    ...structuredClone(scanned),
    provenance: { kind: "scanned", note: "Read from the Bill photo you scanned and confirmed." },
  };
  return [...moved.map(dropUndefined), dropUndefined(latest)];
}

/**
 * Sample meter readings would never meet the real Bill's, so reading continuity would fail on
 * made-up data. Walking back from the scanned previous reading, each sample month's readings are
 * rewritten so that its present reading is the next month's previous reading.
 */
function chainReadings(earlier: Bill[], scanned: Bill) {
  let next = scanned.previousReading;
  for (let i = earlier.length - 1; i >= 0; i--) {
    const bill = earlier[i]!;
    if (next === undefined || next - bill.kwh < 0) {
      delete bill.previousReading; delete bill.presentReading;
      next = undefined;
      continue;
    }
    bill.presentReading = next;
    bill.previousReading = next - bill.kwh;
    next = bill.previousReading;
  }
}

function dropUndefined(bill: Bill): Bill {
  return Object.fromEntries(Object.entries(bill).filter(([, v]) => v !== undefined)) as unknown as Bill;
}
