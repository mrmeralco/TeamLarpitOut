/**
 * Home: the pay-ready summary and the three questions. Every figure and
 * sentence here is built by code from Meralco's own Bill and the decoders.
 */

export type Badge = "green" | "yellow" | "red";

export interface BadgeInput {
  /** From Bill Checks, including yellow when usage is an unexplained outlier. */
  checksOverall: Badge;
  /** Usage Outlier (#6); undefined until it is computed. */
  usageOutlier?: boolean;
}

/** 🔴 any failed Bill Check wins; 🟡 a Usage Outlier; otherwise 🟢 (plan §2.4). */
export function homeBadge({ checksOverall, usageOutlier }: BadgeInput): Badge {
  if (checksOverall === "red") return "red";
  if (checksOverall === "yellow" || usageOutlier) return "yellow";
  return "green";
}

export const BADGE_LABEL: Record<Badge, string> = {
  green: "Bill verified",
  yellow: "Higher than usual",
  red: "Something doesn't match",
};

export type HomeAction =
  | { kind: "missions"; label: string; screen: "missions" }
  | { kind: "householdChange"; label: string; screen: "missions" }
  | { kind: "askMeralco"; label: string; screen: "tama-ba"; summary: string };

/** One "What should I do?" action, chosen by the badge. Red never points to Missions; yellow never to Meralco. */
export function homeAction(badge: Badge, checksSummary: string): HomeAction {
  if (badge === "red") return { kind: "askMeralco", label: "Ask Meralco", screen: "tama-ba", summary: checksSummary };
  if (badge === "yellow") return { kind: "householdChange", label: "Did something change at home? See Missions", screen: "missions" };
  return { kind: "missions", label: "See Missions", screen: "missions" };
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
      return up ? "a higher rate per kWh" : "a lower rate per kWh";
    case "billingDays":
      return up ? "a longer billing period" : "a shorter billing period";
    case "weather":
      return up ? "hotter weather" : "cooler weather";
    case "habit":
      return up ? "more use at home" : "less use at home";
    case "lifeline":
      return up ? "losing the lifeline discount" : "getting the lifeline discount";
    case "catchUp":
      return "catch-up from an estimated Bill";
    default:
      return key;
  }
}

/**
 * The one-sentence "Why this bill?": the change and its biggest driver in the
 * same direction, e.g. "Up ₱312.40 from October, mostly from hotter weather."
 */
export function bakitGanitoSentence(total: number, parts: ChangePart[], previousMonth: string): string {
  if (Math.abs(total) < 100) return `About the same as ${previousMonth}; it changed by less than ₱1.`;
  const sameDirection = parts.filter((p) => Math.sign(p.amount) === Math.sign(total));
  const biggest = sameDirection.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
  const verb = total > 0 ? "Up" : "Down";
  const driver = biggest ? `, mostly from ${reason(biggest.key, biggest.amount)}` : "";
  return `${verb} ${peso(total)} from ${previousMonth}${driver}.`;
}
