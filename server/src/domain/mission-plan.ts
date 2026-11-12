import type { ApplianceType } from "./appliance-catalog.js";
import type { ApplianceUsage, Assumption, RankedMission } from "./mission-catalog.js";

/**
 * The 5% Mission Plan (ADR-0007). Code computes every candidate the household's
 * appliances and routine allow, each with its kWh, pesos and share of the goal;
 * the AI may pick up to five ids and word them, but never supplies a figure.
 * A plan with unknown ids or invented figures is rejected for a greedy pick.
 */
export const MAX_PLAN = 5;

export interface Candidate extends RankedMission {
  /** Share of the 5% goal, 0–1+. */
  share: number;
  /** Percent of the Baseline this Mission saves (the goal is 5). */
  percent: number;
  effort: "Easy" | "Medium";
  /** Missions in the same group change the same habit and are never in one plan together. */
  group: string;
  why: string;
  how: string[];
}

export interface PlannedMission {
  id: string;
  title: string;
  why: string;
}

export interface Plan {
  missions: Candidate[];
  wording: Record<string, { title: string; why: string }>;
  /** Share of the goal the plan covers. */
  covered: number;
  source: "ai" | "fallback";
}

const GROUP: Record<string, string> = {
  "aircon-timer-2h": "aircon-hours", "aircon-off-1h": "aircon-hours", "fan-first-hour": "aircon-hours",
  "aircon-25c": "aircon-setting",
};
const EFFORT: Record<string, Candidate["effort"]> = {
  "aircon-25c": "Easy", "aircon-off-1h": "Easy", "aircon-timer-2h": "Medium", "fan-first-hour": "Medium", "unplug-standby": "Easy",
  "lights-off": "Easy", "iron-batch": "Medium", "washing-full-loads": "Medium", "ref-medium": "Easy", "tv-hour-less": "Medium",
};
const HOW: Record<string, string[]> = {
  "aircon-25c": ["Set the aircon to 25°C instead of colder.", "Use the electric fan to keep air moving."],
  "aircon-timer-2h": ["Set the aircon's sleep timer to turn off 2 hours before you wake up.", "Leave the electric fan on low."],
  "aircon-off-1h": ["Set the aircon's sleep timer 1 hour earlier than usual.", "Leave the electric fan on to keep air moving."],
  "fan-first-hour": ["Start the night with the electric fan only.", "Turn the aircon on after the first hour if it's still warm."],
  "unplug-standby": ["Unplug the TV, set-top box and chargers before sleeping, or switch off the extension cord."],
  "lights-off": ["Switch off lights when leaving a room.", "Use one light in the room where everyone is."],
  "iron-batch": ["Iron the whole week's clothes in one go.", "Start with clothes that need low heat while the iron warms up."],
  "washing-full-loads": ["Wait until the machine is full before washing.", "Combine small loads into one."],
  "ref-medium": ["Turn the ref dial to the middle setting.", "Keep the door closed and let food cool before storing."],
  "tv-hour-less": ["Pick one hour a day with the TV off, e.g. during dinner."],
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const pesos = (centavos: number) => `~₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;

/** "Why this is in your plan", built from the household's own figures. */
function whyText(m: RankedMission, usage: ApplianceUsage[]): string {
  const of = (type: ApplianceType) => usage.filter((u) => u.type === type);
  const hours = (type: ApplianceType) => {
    const items = of(type);
    const kwh = items.reduce((s, u) => s + u.kwh, 0);
    return kwh > 0 ? Math.round(items.reduce((s, u) => s + (u.hoursPerDay ?? 0) * u.kwh, 0) / kwh) : 0;
  };
  const save = `saves around ${round1(m.kwhSaved)} kWh this period (${pesos(m.pesoValue)})`;
  switch (m.appliance) {
    case "aircon": return `Your aircon runs about ${hours("aircon")} hours a day, the biggest use in your home. This ${save}.`;
    case "tv": return `You have ${of("tv").reduce((s, u) => s + u.quantity, 0)} TV(s) on most evenings. This ${save}.`;
    case "lights": return `Lights are on about ${hours("lights")} hours a day. This ${save}.`;
    case "refrigerator": return `The ref runs all day, every day. This ${save}.`;
    case "flat_iron": return `Each time the iron heats up it uses power before you start. This ${save}.`;
    case "washing_machine": return `Half loads use almost as much power as full ones. This ${save}.`;
    default: return `This ${save}.`;
  }
}

/** Every candidate this home allows, with its share of the 5% goal. */
export function buildCandidates(ranked: RankedMission[], usage: ApplianceUsage[], goalKwh: number, baselineKwh: number): Candidate[] {
  return ranked.map((m) => ({
    ...m,
    share: goalKwh > 0 ? m.kwhSaved / goalKwh : 0,
    percent: baselineKwh > 0 ? round1((m.kwhSaved / baselineKwh) * 100) : 0,
    effort: EFFORT[m.id] ?? "Medium",
    group: GROUP[m.id] ?? m.id,
    why: whyText(m, usage),
    how: HOW[m.id] ?? [],
  }));
}

const coverage = (missions: Candidate[]) => missions.reduce((s, m) => s + m.share, 0);
const compatible = (missions: Candidate[]) => new Set(missions.map((m) => m.group)).size === missions.length;

/**
 * Deterministic pick: largest savings first, mixed across appliances (no single Mission over 3/4 of
 * the goal at first), then any habit not yet used, until the goal is covered or five are chosen;
 * then trims Missions that aren't needed to stay ≥ 5%.
 * `exclude` drops ids (for shuffle), `keep` forces ids (for swap).
 */
export function greedyPlan(candidates: Candidate[], opts: { exclude?: string[]; keep?: string[] } = {}): Candidate[] {
  const exclude = new Set(opts.exclude ?? []);
  const picked: Candidate[] = candidates.filter((c) => opts.keep?.includes(c.id));
  const pool = candidates.filter((c) => !exclude.has(c.id) && !picked.some((p) => p.id === c.id))
    .sort((a, b) => b.kwhSaved - a.kwhSaved || a.id.localeCompare(b.id));
  const usable = (c: Candidate) => !picked.includes(c) && !picked.some((p) => p.group === c.group);
  // Pass 1 builds a mixed plan: one per appliance, no single Mission over 3/4 of the goal, one slot left free.
  for (const c of pool) {
    if (picked.length >= MAX_PLAN - 1 || coverage(picked) >= 1) break;
    if (usable(c) && c.share <= 0.75 && !picked.some((p) => p.appliance === c.appliance)) picked.push(c);
  }
  // Pass 2 closes the gap with the smallest unused habit that covers it, else the largest, until five.
  while (picked.length < MAX_PLAN && coverage(picked) < 1) {
    const gap = 1 - coverage(picked);
    const options = pool.filter(usable);
    if (!options.length) break;
    const closes = options.filter((c) => c.share >= gap - 1e-9).sort((a, b) => a.kwhSaved - b.kwhSaved)[0];
    picked.push(closes ?? options[0]!);
  }
  // Drop the smallest non-kept Missions while the plan still reaches the goal.
  for (const c of [...picked].sort((a, b) => a.kwhSaved - b.kwhSaved)) {
    if (opts.keep?.includes(c.id)) continue;
    const without = picked.filter((p) => p.id !== c.id);
    if (coverage(without) >= 1) picked.splice(picked.indexOf(c), 1);
  }
  return picked.sort((a, b) => b.kwhSaved - a.kwhSaved);
}

/** Numbers the wording of one Mission may mention: its own figures only. */
function allowedNumbers(c: Candidate): number[] {
  const n = [c.kwhSaved, round1(c.kwhSaved), Math.round(c.kwhSaved), c.pesoValue / 100, Math.round(c.pesoValue / 100), c.percent, round1(c.share * 100), Math.round(c.share * 100)];
  const fromTitle = [...c.title.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const fromWhy = [...c.why.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return [...n, ...fromTitle, ...fromWhy];
}

/** True when every number in the text is one of this Mission's figures. */
export function wordingIsFactual(text: string, c: Candidate): boolean {
  const allowed = allowedNumbers(c);
  for (const m of text.replace(/(\d),(\d{3})/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)) {
    const x = Number(m[0]);
    if (!allowed.some((a) => Math.abs(a - x) < 0.051)) return false;
  }
  return true;
}

/**
 * Accepts the AI's plan only if every id is a candidate (no repeats, no two from one
 * habit group, at most five), every figure in its wording is the Mission's own, it isn't
 * a set the caller asked to avoid, and it reaches the goal whenever the candidates can.
 */
export function validateAiPlan(
  picked: PlannedMission[] | null | undefined,
  candidates: Candidate[],
  opts: { avoid?: string[][]; best?: number } = {},
): Plan | null {
  if (!Array.isArray(picked) || picked.length === 0 || picked.length > MAX_PLAN) return null;
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const missions: Candidate[] = [];
  const wording: Plan["wording"] = {};
  for (const p of picked) {
    const c = typeof p?.id === "string" ? byId.get(p.id) : undefined;
    if (!c || missions.includes(c)) return null;
    const title = typeof p.title === "string" && p.title.trim() ? p.title.trim().slice(0, 120) : c.title;
    const why = typeof p.why === "string" && p.why.trim() ? p.why.trim().slice(0, 400) : c.why;
    if (!wordingIsFactual(title, c) || !wordingIsFactual(why, c)) return null;
    missions.push(c);
    wording[c.id] = { title, why };
  }
  if (!compatible(missions)) return null;
  const key = missions.map((m) => m.id).sort().join(",");
  if (opts.avoid?.some((a) => [...a].sort().join(",") === key)) return null;
  const covered = coverage(missions);
  const reachable = opts.best ?? coverage(greedyPlan(candidates));
  if (covered < Math.min(1, reachable) - 1e-9) return null;
  return { missions: missions.sort((a, b) => b.kwhSaved - a.kwhSaved), wording, covered, source: "ai" };
}

export function fallbackPlan(candidates: Candidate[], opts: { exclude?: string[]; keep?: string[] } = {}): Plan {
  const missions = greedyPlan(candidates, opts);
  return { missions, wording: Object.fromEntries(missions.map((m) => [m.id, { title: m.title, why: m.why }])), covered: coverage(missions), source: "fallback" };
}

export { coverage as planCoverage };
export type { Assumption };
