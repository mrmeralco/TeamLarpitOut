/**
 * What each printed Bill line is and who gets the money.
 *
 * Lines are recognised only by their printed label. A label that matches no
 * entry is "unknown" and is never guessed: no kind, no payee, no explanation.
 */

export type LineKind = "perKwh" | "fixed" | "tax";

/** Who the money goes to. Pass-through: Meralco collects it for someone else. */
export type PayeeType = "passThrough" | "meralco" | "government" | "subsidy";

export interface Payee {
  type: PayeeType;
  /** Plain English, e.g. "Power plants". */
  name: string;
}

export interface CatalogEntry {
  code: string;
  match: RegExp;
  /** Fixed kind, or "byUnit" when the same charge has per-kWh and per-customer parts. */
  kind: LineKind | "byUnit";
  payee: Payee;
  what: string;
}

const MERALCO: Payee = { type: "meralco", name: "Meralco (this is the part Meralco keeps)" };

/** Order matters: the first matching entry wins. */
export const CHARGE_CATALOG: CatalogEntry[] = [
  {
    code: "lifeline",
    match: /lifeline/,
    kind: "perKwh",
    payee: { type: "subsidy", name: "Discount for, or contribution to, lifeline (low-income) customers" },
    what: "A discount if your usage is low; otherwise your contribution for lifeline customers.",
  },
  {
    code: "senior_citizen",
    match: /senior/,
    kind: "perKwh",
    payee: { type: "subsidy", name: "Discount for, or contribution to, senior citizens" },
    what: "The senior citizen subsidy set by law.",
  },
  {
    code: "subsidies",
    match: /subsid/,
    kind: "perKwh",
    payee: { type: "subsidy", name: "Other customers with a subsidy" },
    what: "Subsidies set by law, shared among customers.",
  },
  {
    code: "universal",
    match: /universal|missionary|environmental|stranded|\bnpc\b|psalm/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "Government (PSALM / NPC) for electricity programs" },
    what: "Universal Charges: funds for power in remote areas, the environment, and old NPC debts.",
  },
  {
    code: "fit_all",
    match: /fit[\s-]?all|feed[\s-]?in/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "Renewable energy developers (through TransCo)" },
    what: "Feed-in Tariff Allowance: support for solar, wind and other renewable plants.",
  },
  {
    code: "generation",
    match: /generation/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "Power plants (generation companies)" },
    what: "The price of the electricity itself, bought by Meralco from power plants. The biggest part of the bill.",
  },
  {
    code: "transmission",
    match: /transmission/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "NGCP (which runs the transmission lines)" },
    what: "The cost of carrying power from the plants to Meralco.",
  },
  {
    code: "system_loss",
    match: /system\s*loss/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "Power plants (for power lost on the lines)" },
    what: "The cost of power lost on the lines before it reaches homes, within a set cap.",
  },
  {
    code: "distribution",
    match: /distribution/,
    kind: "perKwh",
    payee: MERALCO,
    what: "Paid to Meralco for running and maintaining the lines and poles to your home.",
  },
  {
    code: "supply",
    match: /supply/,
    kind: "byUnit",
    payee: MERALCO,
    what: "Paid to Meralco for customer service: billing, collection and customer care.",
  },
  {
    code: "metering",
    match: /meter/,
    kind: "byUnit",
    payee: MERALCO,
    what: "Paid to Meralco for your meter: reading, maintaining and replacing it.",
  },
  {
    code: "vat",
    match: /\bvat\b|value[\s-]?added/,
    kind: "tax",
    payee: { type: "government", name: "Government (BIR)" },
    what: "Value Added Tax on the charges.",
  },
  {
    code: "local_tax",
    match: /franchise|local\s*tax|real\s*property|\btax\b/,
    kind: "tax",
    payee: { type: "government", name: "Local or national government" },
    what: "A tax Meralco collects for the government.",
  },
];

const FIXED_HINT = /cust|customer|\/\s*mo\b|month|buwan|fixed|per\s*meter/;
const KWH_HINT = /kwh/;

export interface Classified {
  known: boolean;
  code: string | null;
  /** null when the line is unknown, or its unit (per kWh vs. per customer) is not printed. */
  kind: LineKind | null;
  payee: Payee | null;
  what: string;
}

export const UNKNOWN_LINE = "We don't recognise this line yet.";

export function classifyLine(label: string): Classified {
  const l = label.toLowerCase();
  const entry = CHARGE_CATALOG.find((e) => e.match.test(l));
  if (!entry) return { known: false, code: null, kind: null, payee: null, what: UNKNOWN_LINE };

  let kind: LineKind | null = entry.kind === "byUnit" ? null : entry.kind;
  if (entry.kind === "byUnit") kind = FIXED_HINT.test(l) ? "fixed" : KWH_HINT.test(l) ? "perKwh" : null;
  else if (entry.kind === "tax") kind = "tax";
  return { known: true, code: entry.code, kind, payee: entry.payee, what: entry.what };
}
