import { describe, expect, it } from "vitest";
import { rankMissions, SOURCED, type ApplianceUsage } from "../src/domain/mission-catalog.js";

const days = 30;
const usage: ApplianceUsage[] = [
  { type: "aircon", quantity: 1, kwh: 240, hoursPerDay: 8, usesPerWeek: null, rating: 1 },
  { type: "tv", quantity: 1, kwh: 18, hoursPerDay: 5, usesPerWeek: null, rating: 0.12 },
  { type: "refrigerator", quantity: 1, kwh: 33, hoursPerDay: null, usesPerWeek: null, rating: 1.1 },
  { type: "computer", quantity: 1, kwh: 27, hoursPerDay: 6, usesPerWeek: null, rating: 0.15 },
  { type: "electric_fan", quantity: 2, kwh: 15.6, hoursPerDay: 8, usesPerWeek: null, rating: 0.065 },
  { type: "rice_cooker", quantity: 1, kwh: 20, hoursPerDay: null, usesPerWeek: 7, rating: 0.3 },
  { type: "wifi", quantity: 1, kwh: 5, hoursPerDay: null, usesPerWeek: null, rating: 0 },
];
const byId = Object.fromEntries(rankMissions({ billingDays: days, usage }, 12).map((m) => [m.id, m]));

describe("sourced Missions", () => {
  it("cleaning the aircon filter saves 5% of the aircon's kWh (US DOE low end)", () => {
    expect(byId["aircon-clean-filter"]!.kwhSaved).toBeCloseTo(240 * SOURCED.airconCleanFilter, 2);
  });

  it("the TV's energy-saving mode saves 13% of the TV's kWh (NRDC real-world)", () => {
    expect(byId["tv-eco-mode"]!.kwhSaved).toBeCloseTo(18 * 0.13, 2);
  });

  it("opening the ref less saves 3% of the ref's kWh", () => {
    expect(byId["ref-door"]!.kwhSaved).toBeCloseTo(33 * 0.03, 2);
  });

  it("sleeping the computer 1 idle hour a day saves its draw minus 2 W sleep", () => {
    const kw = 27 / (6 * days);
    expect(byId["computer-sleep"]!.kwhSaved).toBeCloseTo((kw - 0.002) * days, 2);
  });

  it("switching off fans 1 hour a day saves an hour of their draw", () => {
    expect(byId["fan-off-empty"]!.kwhSaved).toBeCloseTo((15.6 / (8 * days)) * days, 2);
  });

  it("skipping Keep Warm saves 40 W × 3 hours per cook, at most half the rice cooker's kWh", () => {
    expect(byId["rice-unplug-warm"]!.kwhSaved).toBeCloseTo(Math.min(0.04 * 3 * 7 * (days / 7), 10), 2);
  });

  it("the Wi-Fi router off 6 hours a night saves 7 W × 6 h a day", () => {
    expect(byId["wifi-off-night"]!.kwhSaved).toBeCloseTo(0.007 * 6 * days, 2);
  });

  it("a home with only a computer, a ref and a washing machine still gets a computer Mission", () => {
    const small = rankMissions({ billingDays: days, usage: [usage[2]!, usage[3]!, { type: "washing_machine", quantity: 1, kwh: 8, hoursPerDay: null, usesPerWeek: 3, rating: 0.6 }] }, 12);
    expect(small.map((m) => m.id)).toEqual(expect.arrayContaining(["computer-sleep", "ref-medium", "ref-door", "washing-full-loads"]));
  });
});
