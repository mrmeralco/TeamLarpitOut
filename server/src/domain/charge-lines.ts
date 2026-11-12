import type { ChargeLine } from "./bill.js";
import { buildBillBreakdown, type BillBreakdownRow } from "./bill-breakdown.js";
import type { LineKind, PayeeType } from "./charge-catalog.js";

/**
 * The Bill's lines as Home shows them: one entry per charge with a stable id
 * (used by the charge chat), its amount, its change vs. last month and who gets
 * the money. Built from the existing breakdown; no new math.
 */
export interface HomeChargeLine {
  id: string;
  label: string;
  /** Centavos on this Bill. */
  amount: number;
  /** Centavos on the previous Bill, or null when the line was not on it (or it had no lines). */
  previous: number | null;
  /** amount − previous, or null without a previous amount. */
  change: number | null;
  kind: LineKind | null;
  payee: { type: PayeeType; name: string } | null;
  /** "Pass-through", "Meralco", "Government", "Subsidy" or null when unknown. */
  goesTo: string | null;
  /** The printed labels folded into this line. */
  printed: string[];
}

const GOES_TO: Record<PayeeType, string> = {
  passThrough: "Pass-through",
  meralco: "Meralco",
  government: "Government",
  subsidy: "Subsidy",
};

/** The five charges Home shows first; everything else is under "View all". */
export const FEATURED = [
  { id: "generation", label: "Generation" },
  { id: "distribution", label: "Distribution" },
  { id: "system_loss", label: "System loss" },
  { id: "transmission", label: "Transmission" },
  { id: "taxes", label: "Taxes" },
] as const;

const TITLE: Record<string, string> = {
  generation: "Generation", distribution: "Distribution", system_loss: "System loss", transmission: "Transmission",
  taxes: "Taxes", supply: "Supply", metering: "Metering", universal: "Universal charges", fit_all: "FIT-All",
  subsidies: "Subsidies", lifeline: "Lifeline", senior_citizen: "Senior citizen",
};

/** Which Home line a breakdown row belongs to. Taxes fold together; unknown lines keep their own label. */
function lineId(row: BillBreakdownRow): string {
  if (row.kind === "tax") return "taxes";
  if (row.code) return row.code;
  return `other-${row.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "line"}`;
}

export function homeChargeLines(now: ChargeLine[], before: ChargeLine[] = []) {
  const breakdown = buildBillBreakdown(now, before);
  const rows = breakdown.groups.flatMap((g) => g.rows);
  const byId = new Map<string, HomeChargeLine>();
  for (const row of rows) {
    const id = lineId(row);
    const prevRow = row.change.status === "changed" ? row.change.previous : null;
    const existing = byId.get(id);
    if (existing) {
      existing.amount += row.amount;
      existing.previous = existing.previous === null || prevRow === null ? null : existing.previous + prevRow;
      existing.printed.push(row.label);
      if (existing.kind !== row.kind) existing.kind = null;
      continue;
    }
    const payee = id === "taxes" ? { type: "government" as const, name: "Government (BIR and local government)" } : row.payee;
    byId.set(id, {
      id,
      label: TITLE[id] ?? row.label,
      amount: row.amount,
      previous: prevRow,
      change: null,
      kind: row.kind,
      payee,
      goesTo: payee ? GOES_TO[payee.type] : null,
      printed: [row.label],
    });
  }
  const all = [...byId.values()].map((l) => ({ ...l, change: l.previous === null ? null : l.amount - l.previous }));
  const featured = FEATURED.map((f) => all.find((l) => l.id === f.id)).filter((l): l is HomeChargeLine => Boolean(l));
  return { featured, all, total: breakdown.total };
}
