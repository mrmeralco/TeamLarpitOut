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
  /** Plain Tagalog, e.g. "Mga planta ng kuryente". */
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

const MERALCO: Payee = { type: "meralco", name: "Meralco (ito ang bahaging kanila)" };

/** Order matters: the first matching entry wins. */
export const CHARGE_CATALOG: CatalogEntry[] = [
  {
    code: "lifeline",
    match: /lifeline/,
    kind: "perKwh",
    payee: { type: "subsidy", name: "Discount o ambag para sa mga lifeline (low-income) customer" },
    what: "Discount kung mababa ang konsumo mo, o ambag mo para sa mga lifeline customer kung hindi.",
  },
  {
    code: "senior_citizen",
    match: /senior/,
    kind: "perKwh",
    payee: { type: "subsidy", name: "Discount o ambag para sa mga senior citizen" },
    what: "Subsidy para sa mga senior citizen na itinakda ng batas.",
  },
  {
    code: "subsidies",
    match: /subsid/,
    kind: "perKwh",
    payee: { type: "subsidy", name: "Ibang customer na may subsidy" },
    what: "Mga subsidy na itinakda ng batas, hinahati sa mga customer.",
  },
  {
    code: "universal",
    match: /universal|missionary|environmental|stranded|\bnpc\b|psalm/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "Gobyerno (PSALM / NPC) para sa mga programang pang-kuryente" },
    what: "Universal Charges: pondo para sa kuryente sa malalayong lugar, kalikasan, at lumang utang ng NPC.",
  },
  {
    code: "fit_all",
    match: /fit[\s-]?all|feed[\s-]?in/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "Mga renewable energy developer (sa pamamagitan ng TransCo)" },
    what: "Feed-in Tariff Allowance: tulong sa mga planta ng solar, hangin at iba pang renewable.",
  },
  {
    code: "generation",
    match: /generation/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "Mga planta ng kuryente (generation companies)" },
    what: "Ang presyo ng kuryente mismo, binili ng Meralco sa mga planta. Pinakamalaking bahagi ng bill.",
  },
  {
    code: "transmission",
    match: /transmission/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "NGCP (ang nagpapatakbo ng transmission lines)" },
    what: "Bayad sa pagdadala ng kuryente mula sa planta hanggang sa Meralco.",
  },
  {
    code: "system_loss",
    match: /system\s*loss/,
    kind: "perKwh",
    payee: { type: "passThrough", name: "Mga planta ng kuryente (para sa kuryenteng nawala sa linya)" },
    what: "Gastos sa kuryenteng nawawala sa mga linya bago makarating sa bahay, may takdang limit.",
  },
  {
    code: "distribution",
    match: /distribution/,
    kind: "perKwh",
    payee: MERALCO,
    what: "Bayad sa Meralco sa pagpapatakbo at pag-aalaga ng mga linya at poste papunta sa bahay mo.",
  },
  {
    code: "supply",
    match: /supply/,
    kind: "byUnit",
    payee: MERALCO,
    what: "Bayad sa Meralco sa serbisyo sa customer: billing, collection, at customer care.",
  },
  {
    code: "metering",
    match: /meter/,
    kind: "byUnit",
    payee: MERALCO,
    what: "Bayad sa Meralco sa metro mo: pagbasa, pag-aalaga at pagpapalit nito.",
  },
  {
    code: "vat",
    match: /\bvat\b|value[\s-]?added/,
    kind: "tax",
    payee: { type: "government", name: "Gobyerno (BIR)" },
    what: "Value Added Tax na ipinapataw sa mga singil.",
  },
  {
    code: "local_tax",
    match: /franchise|local\s*tax|real\s*property|\btax\b/,
    kind: "tax",
    payee: { type: "government", name: "Lokal na pamahalaan o gobyerno" },
    what: "Buwis na kinokolekta ng Meralco para sa pamahalaan.",
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

export const UNKNOWN_LINE = "Hindi pa namin kilala ang linyang ito.";

export function classifyLine(label: string): Classified {
  const l = label.toLowerCase();
  const entry = CHARGE_CATALOG.find((e) => e.match.test(l));
  if (!entry) return { known: false, code: null, kind: null, payee: null, what: UNKNOWN_LINE };

  let kind: LineKind | null = entry.kind === "byUnit" ? null : entry.kind;
  if (entry.kind === "byUnit") kind = FIXED_HINT.test(l) ? "fixed" : KWH_HINT.test(l) ? "perKwh" : null;
  else if (entry.kind === "tax") kind = "tax";
  return { known: true, code: entry.code, kind, payee: entry.payee, what: entry.what };
}
