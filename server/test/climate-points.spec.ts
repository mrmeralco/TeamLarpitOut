import { describe, expect, it } from "vitest";
import { climateFor } from "../src/domain/climate.js";
import { earnedPoints } from "../src/domain/points.js";

describe("climate of a bill period (PAGASA ENSO advisories)", () => {
  it.each([
    ["2025-10", "neutral", 1],
    ["2025-12", "laNina", 0.9],
    ["2026-03", "neutral", 1],
    ["2026-06", "elNino", 1.15],
    ["2026-11", "elNino", 1.3],
    ["2024-05", "neutral", 1],
  ])("%s is %s (×%s)", (period, phase, multiplier) => {
    const c = climateFor(period);
    expect(c).toMatchObject({ phase, multiplier });
    expect(c.source).toContain("PAGASA");
  });
});

describe("earnedPoints", () => {
  const baseline = 300_000; // ₱3,000 Baseline: noise band ₱30, goal (5%) ₱150

  it("counts nothing inside the 1% noise band", () => {
    expect(earnedPoints({ savedCentavos: 3_000, baselineCentavos: baseline }).points).toBe(0);
  });

  it("is 1 point per ₱2 past the noise band, up to the goal", () => {
    // ₱130 saved − ₱30 noise = ₱100 → 50 pts
    expect(earnedPoints({ savedCentavos: 13_000, baselineCentavos: baseline }).points).toBe(50);
  });

  it("counts savings past the goal at half rate, and nothing past twice the goal", () => {
    // ₱330 − ₱30 = ₱300: ₱150 in full + ₱150 at half = ₱225 → 112 pts
    expect(earnedPoints({ savedCentavos: 33_000, baselineCentavos: baseline }).points).toBe(112);
    expect(earnedPoints({ savedCentavos: 90_000, baselineCentavos: baseline }).points).toBe(112);
  });

  it("applies the climate multiplier and gives nothing for a brownout month", () => {
    expect(earnedPoints({ savedCentavos: 13_000, baselineCentavos: baseline, multiplier: 1.3 }).points).toBe(65);
    expect(earnedPoints({ savedCentavos: 13_000, baselineCentavos: baseline, multiplier: 0.9 }).points).toBe(45);
    expect(earnedPoints({ savedCentavos: 13_000, baselineCentavos: baseline, multiplier: 1.3, hasOutage: true }).points).toBe(0);
  });
});
