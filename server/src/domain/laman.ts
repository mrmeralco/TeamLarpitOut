import type { ChargeLine } from "./bill.js";
import { classifyLine, type LineKind, type Payee } from "./chargeCatalog.js";

/** "Ano'ng laman ng bill ko?": the household's own Bill lines, redrawn and explained. */

export type GroupKey = LineKind | "unclear" | "unknown";

export interface LineChange {
  /** "changed": same line last month; "new": not on last month's Bill; "noPrevious": last Bill has no lines. */
  status: "changed" | "new" | "noPrevious";
  /** Centavos vs. last month; null unless status is "changed". */
  amount: number | null;
  previous: number | null;
}

export interface LamanRow {
  label: string;
  amount: number;
  known: boolean;
  code: string | null;
  kind: LineKind | null;
  payee: Payee | null;
  what: string;
  change: LineChange;
}

export interface LamanGroup {
  key: GroupKey;
  title: string;
  total: number;
  rows: LamanRow[];
}

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: "perKwh", title: "Singil kada kWh" },
  { key: "fixed", title: "Fixed Charges (kada buwan, kahit gaano kakonti ang gamit)" },
  { key: "unclear", title: "Hindi naka-print kung kada kWh o kada buwan" },
  { key: "tax", title: "Buwis" },
  { key: "unknown", title: "Hindi pa kilala" },
];

const toCentavos = (pesos: number) => Math.round(pesos * 100);
const norm = (label: string) => label.toLowerCase().replace(/\s+/g, " ").trim();

/** A line's identity across months: its catalog code and kind, or its exact label if unknown. */
function identity(label: string): string {
  const c = classifyLine(label);
  return c.known ? `${c.code}:${c.kind ?? "?"}` : `label:${norm(label)}`;
}

export function laman(now: ChargeLine[], before: ChargeLine[] = []) {
  const previous = new Map<string, number>();
  for (const l of before) {
    const id = identity(l.label);
    previous.set(id, (previous.get(id) ?? 0) + toCentavos(l.amount));
  }

  const rows: LamanRow[] = now.map((line) => {
    const c = classifyLine(line.label);
    const amount = toCentavos(line.amount);
    const prev = previous.get(identity(line.label));
    const change: LineChange =
      before.length === 0
        ? { status: "noPrevious", amount: null, previous: null }
        : prev === undefined
          ? { status: "new", amount: null, previous: null }
          : { status: "changed", amount: amount - prev, previous: prev };
    return { label: line.label, amount, ...c, change };
  });

  const groupOf = (r: LamanRow): GroupKey => (!r.known ? "unknown" : (r.kind ?? "unclear"));
  const groups: LamanGroup[] = GROUPS.map((g) => {
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
