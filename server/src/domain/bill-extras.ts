import type { ChargeLine } from "./bill.js";

/**
 * Printed lines that are not part of the month's energy charges: credits,
 * refunds, adjustments and balances carried over. They are listed apart from
 * "Bakit ganito?" so they never distort the four effects.
 */

export type ExtraKind = "priorBalance" | "refund" | "credit" | "adjustment";

const RULES: { kind: ExtraKind; match: RegExp; label: string }[] = [
  {
    kind: "priorBalance",
    match: /previous\s*balance|prior\s*balance|balance\s*(from|forward)|arrear|unpaid|outstanding|overdue/,
    label: "Balance from previous bills",
  },
  { kind: "refund", match: /refund/, label: "Refund" },
  { kind: "credit", match: /credit|rebate|overpay|advance\s*payment|bill\s*deposit/, label: "Credit" },
  {
    kind: "adjustment",
    match: /adjust|differential|back[\s-]?bill|correction|recovery|reduction/,
    label: "Adjustment",
  },
];

export interface ExtraLine {
  label: string;
  amount: number;
  kind: ExtraKind;
  kindLabel: string;
}

export function extraKind(label: string): { kind: ExtraKind; label: string } | null {
  const l = label.toLowerCase();
  const rule = RULES.find((r) => r.match.test(l));
  return rule ? { kind: rule.kind, label: rule.label } : null;
}

const toCentavos = (pesos: number) => Math.round(pesos * 100);

/** Splits printed lines into energy charges and extras (amounts in centavos). */
export function splitExtras(lines: ChargeLine[] = []) {
  const extras: ExtraLine[] = [];
  let charges = 0;
  for (const l of lines) {
    const k = extraKind(l.label);
    if (k) extras.push({ label: l.label, amount: toCentavos(l.amount), kind: k.kind, kindLabel: k.label });
    else charges += toCentavos(l.amount);
  }
  return { charges, extras, extrasTotal: extras.reduce((s, e) => s + e.amount, 0) };
}
