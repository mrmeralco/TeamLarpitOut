import type { ChargeLine } from "./bill.js";
import { classifyLine, type LineKind, type Payee } from "./charge-catalog.js";

/** "What's on my bill?": the household's own Bill lines, redrawn and explained. */

export type GroupKey = LineKind | "unclear" | "unknown";

export interface LineChange {
  /** "changed": same line last month; "new": not on last month's Bill; "noPrevious": last Bill has no lines. */
  status: "changed" | "new" | "noPrevious";
  /** Centavos vs. last month; null unless status is "changed". */
  amount: number | null;
  previous: number | null;
}

export interface BillBreakdownRow {
  label: string;
  amount: number;
  known: boolean;
  code: string | null;
  kind: LineKind | null;
  payee: Payee | null;
  what: string;
  change: LineChange;
}

export interface BillBreakdownGroup {
  key: GroupKey;
  title: string;
  total: number;
  rows: BillBreakdownRow[];
}

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: "perKwh", title: "Charges per kWh" },
  { key: "fixed", title: "Fixed charges (per month, however little you use)" },
  { key: "unclear", title: "Not printed whether per kWh or per month" },
  { key: "tax", title: "Taxes" },
  { key: "unknown", title: "Not recognised yet" },
];

const toCentavos = (pesos: number) => Math.round(pesos * 100);
const norm = (label: string) => label.toLowerCase().replace(/\s+/g, " ").trim();

/** A line's identity across months: its catalog code and kind, or its exact label if unknown. */
function identity(label: string): string {
  const c = classifyLine(label);
  return c.known ? `${c.code}:${c.kind ?? "?"}` : `label:${norm(label)}`;
}

export function buildBillBreakdown(now: ChargeLine[], before: ChargeLine[] = []) {
  const previous = new Map<string, number>();
  const previousByLabel = new Map<string, number>();
  for (const l of before) {
    const id = identity(l.label);
    previous.set(id, (previous.get(id) ?? 0) + toCentavos(l.amount));
    previousByLabel.set(norm(l.label), (previousByLabel.get(norm(l.label)) ?? 0) + toCentavos(l.amount));
  }
  // Several lines can share one identity (VAT per kWh and VAT per customer): those match last
  // month's line with the same label only, never the identity's combined amount.
  const sharedIdentities = new Map<string, number>();
  for (const l of now) sharedIdentities.set(identity(l.label), (sharedIdentities.get(identity(l.label)) ?? 0) + 1);

  const rows: BillBreakdownRow[] = now.map((line) => {
    const c = classifyLine(line.label);
    const amount = toCentavos(line.amount);
    const id = identity(line.label);
    const prev = previousByLabel.get(norm(line.label)) ?? (sharedIdentities.get(id) === 1 ? previous.get(id) : undefined);
    const change: LineChange =
      before.length === 0
        ? { status: "noPrevious", amount: null, previous: null }
        : prev === undefined
          ? { status: "new", amount: null, previous: null }
          : { status: "changed", amount: amount - prev, previous: prev };
    return { label: line.label, amount, ...c, change };
  });

  const groupOf = (r: BillBreakdownRow): GroupKey => (!r.known ? "unknown" : (r.kind ?? "unclear"));
  const groups: BillBreakdownGroup[] = GROUPS.map((g) => {
    const inGroup = rows.filter((r) => groupOf(r) === g.key);
    return { ...g, total: inGroup.reduce((s, r) => s + r.amount, 0), rows: inGroup };
  }).filter((g) => g.rows.length > 0);

  return {
    currency: "PHP-centavos",
    groups,
    total: rows.reduce((s, r) => s + r.amount, 0),
    /** Of the known lines, how much is pass-through vs. Meralco's own. */
    split: {
      passThrough: rows.filter((r) => r.payee?.type === "passThrough").reduce((s, r) => s + r.amount, 0),
      meralco: rows.filter((r) => r.payee?.type === "meralco").reduce((s, r) => s + r.amount, 0),
    },
  };
}
