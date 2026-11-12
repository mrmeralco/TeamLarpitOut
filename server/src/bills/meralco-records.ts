import type { Bill, ChargeLine, PaymentRecord } from "../domain/bill.js";
import type { Centavos } from "../domain/rate-schedule.js";
import type { MeralcoAccount } from "./meralco-accounts.js";

/**
 * Meralco-shaped Bill records: what the mock Meralco system stores (the `meralco` schema in
 * Supabase, or the JSON fixtures in memory). The app never reads these directly; sources turn
 * them into the app's `Bill` with toBill(). Amounts are integer centavos.
 */

/** Page 1 "Bill Computation Summary": one printed subtotal per group. */
export interface MeralcoChargeGroup {
  groupCode: string;
  label: string;
  amount: Centavos;
}

/** Page 2 "How your bill was computed": one rate component. */
export interface MeralcoChargeLine {
  groupCode: string;
  /** Stable across months within a group, e.g. generation_charge, awat_collect_1, vat_generation. */
  code: string;
  /** The Rate Schedule code this component rolls up into (ADR-0001 table). */
  scheduleCode: string;
  label: string;
  base: number | null;
  baseUnit: "kwh" | "month" | "pesos" | null;
  price: number | null;
  priceUnit: "per_kwh" | "per_month" | "percent" | null;
  amount: Centavos;
}

export interface MeralcoBillRecord {
  /** Month of the bill date, "YYYY-MM". */
  period: string;
  periodStart: string;
  periodEnd: string;
  billingDays: number;
  billDate: string | null;
  dueDate: string | null;
  meterNumber: string | null;
  previousReading: number | null;
  presentReading: number | null;
  multiplier: number;
  kwh: number;
  estimated: boolean;
  total: Centavos;
  previousBalance: Centavos;
  /** Payments the Bill shows as applied, or null when the record does not say. */
  paymentsCredited: Centavos | null;
  provenance: { kind: "real" | "reconstructed" | "generated" | "sample"; note: string };
  groups: MeralcoChargeGroup[];
  lines: MeralcoChargeLine[];
}

export interface MeralcoPayment {
  forPeriod: string;
  postedOn: string;
  channel: string | null;
  amount: Centavos;
}

export interface MeralcoAccountRecord extends MeralcoAccount {
  holderName: string;
  meterNumber: string | null;
  lifelineEligible: boolean;
}

export interface MeralcoHouseholdRecord {
  account: MeralcoAccountRecord;
  bills: MeralcoBillRecord[];
  payments: MeralcoPayment[];
}

/** The Rate Schedule's codes, in costLines() order, with the labels the app's catalog understands. */
export const SCHEDULE_LINES: { code: string; label: string; group: string }[] = [
  { code: "generation", label: "Generation Charge", group: "generation" },
  { code: "transmission", label: "Transmission Charge", group: "transmission" },
  { code: "system_loss", label: "System Loss Charge", group: "system_loss" },
  { code: "distribution", label: "Distribution Charge", group: "distribution" },
  { code: "supply_kwh", label: "Supply Charge (per kWh)", group: "distribution" },
  { code: "metering_kwh", label: "Metering Charge (per kWh)", group: "distribution" },
  { code: "universal", label: "Universal Charges", group: "universal" },
  { code: "fit_all", label: "FIT-All", group: "fit_all" },
  { code: "subsidies", label: "Subsidies", group: "lifeline" },
  { code: "vat_kwh", label: "VAT (per kWh lines)", group: "taxes" },
  { code: "local_tax", label: "Local Franchise and Real Property Taxes", group: "taxes" },
  { code: "supply_fixed", label: "Supply Charge (per customer)", group: "distribution" },
  { code: "metering_fixed", label: "Metering Charge (per customer)", group: "distribution" },
  { code: "vat_fixed", label: "VAT (per customer lines)", group: "taxes" },
];

export const GROUP_LABELS: Record<string, string> = {
  generation: "Generation",
  transmission: "Transmission",
  system_loss: "System Loss",
  distribution: "Distribution (Meralco)",
  senior_citizen: "Senior Citizen",
  taxes: "Government Taxes",
  universal: "Universal Charges",
  fit_all: "FiT-All (Renewable)",
  gea_all: "GEA-All (Renewable)",
  lifeline: "Lifeline",
  other: "Other charges",
};

const pesos = (c: Centavos) => c / 100;
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "line";

/**
 * The app's Bill lines: every printed component rolled up into its Rate Schedule code, so a
 * real Bill and a Bill rebuilt with costLines() line up label for label (Home's change vs last
 * month, Bill Checks against the Rate Schedule). Zero lines are left out.
 */
export function scheduleLines(lines: MeralcoChargeLine[]): ChargeLine[] {
  const sums = new Map<string, Centavos>();
  const labels = new Map<string, string>();
  for (const line of lines) {
    sums.set(line.scheduleCode, (sums.get(line.scheduleCode) ?? 0) + line.amount);
    if (!labels.has(line.scheduleCode)) labels.set(line.scheduleCode, line.label);
  }
  const known = SCHEDULE_LINES.filter((s) => sums.has(s.code)).map((s) => ({ code: s.code, label: s.label }));
  const unknown = [...sums.keys()].filter((code) => !SCHEDULE_LINES.some((s) => s.code === code)).map((code) => ({ code, label: labels.get(code)! }));
  return [...known, ...unknown]
    .filter(({ code }) => sums.get(code) !== 0)
    .map(({ code, label }) => ({ label, amount: pesos(sums.get(code)!) }));
}

/** A Meralco Bill record as the app's Bill. Payments are attached only when the record says what was credited. */
export function toBill(record: MeralcoBillRecord, payments: MeralcoPayment[] = [], lifelineEligible = false): Bill {
  const credited = record.paymentsCredited;
  const inPeriod = credited === null || !record.billDate
    ? []
    : payments.filter((p) => p.postedOn >= record.periodStart && p.postedOn <= record.billDate!);
  return {
    period: record.period,
    kwh: record.kwh,
    billingDays: record.billingDays,
    chargeLines: scheduleLines(record.lines),
    totalAmount: pesos(record.total),
    ...(record.billDate ? { billDate: record.billDate } : {}),
    ...(record.dueDate ? { dueDate: record.dueDate } : {}),
    ...(record.meterNumber ? { meterSerialNumber: record.meterNumber } : {}),
    ...(record.previousReading !== null ? { previousReading: record.previousReading } : {}),
    ...(record.presentReading !== null ? { presentReading: record.presentReading } : {}),
    ...(credited !== null ? { paymentsCredited: pesos(credited), payments: inPeriod.map((p): PaymentRecord => ({ date: p.postedOn, amount: pesos(p.amount) })) } : {}),
    provenance: record.provenance,
    ...(record.estimated ? { estimated: true } : {}),
    ...(lifelineEligible ? { lifelineEligible: true } : {}),
  };
}

/**
 * The reverse, for the older demo fixtures that only have the app's Bill shape: every line
 * becomes one component of its Rate Schedule code (matched by label), and groups are summed.
 */
export function recordFromBill(bill: Bill, meterNumber: string | null = null): MeralcoBillRecord {
  const lines: MeralcoChargeLine[] = (bill.chargeLines ?? []).map((l) => {
    const known = SCHEDULE_LINES.find((s) => s.label === l.label);
    const code = known?.code ?? slug(l.label);
    return {
      groupCode: known?.group ?? "other", code, scheduleCode: code, label: l.label,
      base: null, baseUnit: null, price: l.rate ?? null, priceUnit: l.rate !== undefined ? "per_kwh" : null,
      amount: Math.round(l.amount * 100),
    };
  });
  const groups = new Map<string, Centavos>();
  for (const line of lines) groups.set(line.groupCode, (groups.get(line.groupCode) ?? 0) + line.amount);
  const end = new Date(`${bill.period}-28T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - bill.billingDays + 1);
  const total = bill.totalAmount !== undefined ? Math.round(bill.totalAmount * 100) : lines.reduce((s, l) => s + l.amount, 0);
  return {
    period: bill.period,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    billingDays: bill.billingDays,
    billDate: bill.billDate ?? null,
    dueDate: bill.dueDate ?? null,
    meterNumber: bill.meterSerialNumber ?? meterNumber,
    previousReading: bill.previousReading ?? null,
    presentReading: bill.presentReading ?? null,
    multiplier: 1,
    kwh: bill.kwh,
    estimated: Boolean(bill.estimated),
    total,
    previousBalance: 0,
    paymentsCredited: bill.paymentsCredited !== undefined ? Math.round(bill.paymentsCredited * 100) : null,
    provenance: (bill.provenance as MeralcoBillRecord["provenance"]) ?? { kind: "generated", note: "" },
    groups: [...groups].map(([groupCode, amount]) => ({ groupCode, label: GROUP_LABELS[groupCode] ?? groupCode, amount })),
    lines,
  };
}
