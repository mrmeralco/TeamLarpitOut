import { describe, expect, it } from "vitest";
import { calibrateToBill, estimateAppliance } from "../src/domain/appliance-usage.js";
import { findAppliance } from "../src/domain/appliance-catalog.js";
import { rankMissions, type ApplianceUsage } from "../src/domain/mission-catalog.js";
import { buildCandidates, greedyPlan, MAX_PLAN, planCoverage, validateAiPlan, wordingIsFactual } from "../src/domain/mission-plan.js";
import { appliancesFromGrid, type AirconPattern, type GridInput } from "../src/domain/routine-presets.js";

const RATE = 11;
function candidatesFor(input: GridInput, billKwh = 300, baselineKwh = 300) {
  const list = appliancesFromGrid(input);
  const estimates = list.map(estimateAppliance);
  const rows = calibrateToBill(estimates, list, { kwh: billKwh, billingDays: 30 }, Math.round(billKwh * RATE * 100));
  const usage: ApplianceUsage[] = list.map((a, i) => ({
    type: a.type, quantity: a.quantity ?? 1, kwh: rows[i]!.kwh,
    hoursPerDay: findAppliance(a.type)!.routine === "timeRanges" ? estimates[i]!.hoursPerDay : null,
    usesPerWeek: a.usesPerWeek ?? null, rating: estimates[i]!.rating,
  }));
  return buildCandidates(rankMissions({ billingDays: 30, usage }, RATE), usage, baselineKwh * 0.05, baselineKwh);
}
const full = (aircon: AirconPattern | null = "afternoonNight"): GridInput => ({
  counts: { ...(aircon ? { aircon: 1 } : {}), refrigerator: 1, electric_fan: 2, tv: 1, washing_machine: 1, flat_iron: 1, rice_cooker: 1 },
  home: "allDay", aircon,
});

describe("Mission candidates", () => {
  it("a home without an aircon gets no aircon Missions", () => {
    const candidates = candidatesFor(full(null));
    expect(candidates.length).toBeGreaterThan(2);
    expect(candidates.some((c) => c.appliance === "aircon" || c.id.includes("aircon") || c.id === "fan-first-hour")).toBe(false);
  });

  it("are mixed across appliances, each with kWh, pesos, share of the goal and labelled assumptions", () => {
    const candidates = candidatesFor(full());
    expect(new Set(candidates.map((c) => c.appliance)).size).toBeGreaterThanOrEqual(5);
    for (const c of candidates) {
      expect(Math.abs(c.pesoValue - c.kwhSaved * RATE * 100)).toBeLessThanOrEqual(RATE * 100 * 0.005 + 1);
      expect(c.share).toBeCloseTo(c.kwhSaved / 15, 5);
      if (c.basis === "assumption") expect(c.assumptions.length).toBeGreaterThan(0);
    }
  });
});

describe("greedy fallback", () => {
  it("reaches ≥ 5% when candidates allow, using at most five Missions, one per habit", () => {
    for (const aircon of ["sleeping", "afternoonNight", "mostOfDay"] as const) {
      const candidates = candidatesFor(full(aircon));
      const plan = greedyPlan(candidates);
      expect(plan.length).toBeLessThanOrEqual(MAX_PLAN);
      expect(planCoverage(plan)).toBeGreaterThanOrEqual(1);
      expect(new Set(plan.map((m) => m.group)).size).toBe(plan.length);
    }
  });

  it("uses the best it can (still ≤ 5) when candidates can't reach 5%", () => {
    const candidates = candidatesFor({ counts: { refrigerator: 1 }, home: "eveningsWeekends", aircon: null }, 300, 3000);
    const plan = greedyPlan(candidates);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(MAX_PLAN);
    expect(planCoverage(plan)).toBeLessThan(1);
    expect(plan.map((m) => m.id).sort()).toEqual(candidates.map((c) => c.id).sort());
  });
});

describe("AI plan validation", () => {
  const candidates = candidatesFor(full());
  const best = greedyPlan(candidates);
  const ok = best.map((c) => ({ id: c.id, title: c.title, why: c.why }));

  it("accepts candidate ids with wording that uses only that Mission's figures", () => {
    const plan = validateAiPlan(ok, candidates);
    expect(plan?.source).toBe("ai");
    expect(plan!.missions.map((m) => m.id).sort()).toEqual(best.map((m) => m.id).sort());
  });

  it("rejects unknown ids, repeats, more than five, two from one habit, and invented figures", () => {
    expect(validateAiPlan([...ok, { id: "solar-panels", title: "Solar", why: "x" }], candidates)).toBeNull();
    expect(validateAiPlan([ok[0]!, ok[0]!], candidates)).toBeNull();
    expect(validateAiPlan(candidates.slice(0, 6).map((c) => ({ id: c.id, title: c.title, why: c.why })), candidates)).toBeNull();
    const ac = candidates.filter((c) => c.group === "aircon-hours");
    expect(ac.length).toBeGreaterThan(1);
    expect(validateAiPlan(ac.slice(0, 2).map((c) => ({ id: c.id, title: c.title, why: c.why })), candidates)).toBeNull();
    const lie = ok.map((p, i) => (i === 0 ? { ...p, why: "This saves ₱9,999 every month." } : p));
    expect(validateAiPlan(lie, candidates)).toBeNull();
    expect(wordingIsFactual(`Saves ${best[0]!.kwhSaved} kWh`, best[0]!)).toBe(true);
    expect(wordingIsFactual("Saves 1234 kWh", best[0]!)).toBe(false);
  });

  it("rejects a plan that falls short of 5% when the candidates can reach it, or repeats a shown set", () => {
    expect(validateAiPlan([{ id: candidates.at(-1)!.id, title: candidates.at(-1)!.title, why: "" }], candidates)).toBeNull();
    expect(validateAiPlan(ok, candidates, { avoid: [best.map((m) => m.id)] })).toBeNull();
  });
});
