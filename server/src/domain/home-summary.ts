/**
 * Home: the pay-ready summary and the three questions. Every figure and
 * sentence here is built by code from Meralco's own Bill and the decoders.
 */

export type Badge = "green" | "yellow" | "red";

export interface BadgeInput {
  /** From the Bill Checks: "red" when any check fails. */
  checksOverall: "green" | "red";
  /** Usage Outlier (#6); undefined until it is computed. */
  usageOutlier?: boolean;
}

/** 🔴 any failed Bill Check wins; 🟡 a Usage Outlier; otherwise 🟢 (plan §2.4). */
export function homeBadge({ checksOverall, usageOutlier }: BadgeInput): Badge {
  if (checksOverall === "red") return "red";
  if (usageOutlier) return "yellow";
  return "green";
}

export const BADGE_LABEL: Record<Badge, string> = {
  green: "Tugma ang bill",
  yellow: "Mas mataas kaysa karaniwan mo",
  red: "May hindi tugma",
};

export type HomeAction =
  | { kind: "missions"; label: string; screen: "missions" }
  | { kind: "householdChange"; label: string; screen: "missions" }
  | { kind: "askMeralco"; label: string; screen: "tama-ba"; summary: string };

/** One "Ano ang gagawin ko?" action, chosen by the badge. Red never points to Missions; yellow never to Meralco. */
export function homeAction(badge: Badge, checksSummary: string): HomeAction {
  if (badge === "red") return { kind: "askMeralco", label: "Itanong kay Meralco", screen: "tama-ba", summary: checksSummary };
  if (badge === "yellow") return { kind: "householdChange", label: "May nagbago ba sa bahay? Tingnan ang Missions", screen: "missions" };
  return { kind: "missions", label: "Tingnan ang Missions", screen: "missions" };
}

interface ChangePart {
  key: string;
  amount: number;
}

const peso = (centavos: number) =>
  `₱${(Math.abs(centavos) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function reason(key: string, amount: number): string {
  const up = amount > 0;
  switch (key) {
    case "rate":
      return up ? "pagtaas ng singil kada kWh" : "pagbaba ng singil kada kWh";
    case "billingDays":
      return up ? "mas mahabang billing period" : "mas maikling billing period";
    case "weather":
      return up ? "mas mainit na panahon" : "mas malamig na panahon";
    case "habit":
      return up ? "mas maraming gamit sa bahay" : "mas kaunting gamit sa bahay";
    case "lifeline":
      return up ? "nawalang lifeline discount" : "nakuhang lifeline discount";
    case "catchUp":
      return "catch-up mula sa tantyang Bill";
    default:
      return key;
  }
}

/**
 * The one-sentence "Bakit ganito?": the change and its biggest driver in the
 * same direction, e.g. "Tumaas ng ₱312.40 mula Oktubre, pinakamalaki ang mas
 * mainit na panahon."
 */
export function bakitGanitoSentence(total: number, parts: ChangePart[], previousMonth: string): string {
  if (Math.abs(total) < 100) return `Halos pareho sa ${previousMonth}; wala pang ₱1 ang pinagbago.`;
  const sameDirection = parts.filter((p) => Math.sign(p.amount) === Math.sign(total));
  const biggest = sameDirection.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
  const verb = total > 0 ? "Tumaas" : "Bumaba";
  const driver = biggest ? `, pinakamalaki ang ${reason(biggest.key, biggest.amount)}` : "";
  return `${verb} ng ${peso(total)} mula ${previousMonth}${driver}.`;
}
