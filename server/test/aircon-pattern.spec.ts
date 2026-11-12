import { describe, expect, it } from "vitest";
import { analyzeAirconPattern } from "../src/domain/aircon-pattern.js";
import { patternFixture } from "./utils/aircon-pattern-fixture.js";

function analyze(options: Parameters<typeof patternFixture>[0] = {}, kw = 1) {
  const fixture = patternFixture(options);
  return analyzeAirconPattern(fixture.rows, fixture.range, kw, fixture.weather);
}

describe("smart-meter aircon pattern heuristics", () => {
  it("proposes the actual overnight window and reports its evidence", () => {
    const result = analyze({ window: () => ({ start: 21, end: 29 }) });
    expect(result).toMatchObject({ canPropose: true, hours: 8,
      routine: { start: "21:00", end: "05:00", days: "everyday" },
      coverage: { completeNights: 14, matchingNights: 14, heatMatchedNights: 14 } });
    if (result.canPropose) {
      expect(result.heat.correlation).toBeGreaterThan(0.5);
      expect(result.heat.kwPerDegreeC).toBeGreaterThan(0.02);
    }
  });

  it("requires seven complete nights and accepts exactly seven", () => {
    expect(analyze({ nights: 6 })).toMatchObject({ canPropose: false, reason: "insufficient-readings" });
    expect(analyze({ nights: 7 })).toMatchObject({ canPropose: true });
  });

  it("requires four contiguous hours and accepts exactly four", () => {
    expect(analyze({ window: () => ({ start: 23, end: 26 }) })).toMatchObject({ canPropose: false });
    expect(analyze({ window: () => ({ start: 23, end: 27 }) })).toMatchObject({ canPropose: true, hours: 4 });
  });

  it.each([0.5, 1.5])("rejects sustained %.1f kW load for a 1 kW aircon", (kw) => {
    expect(analyze({ step: () => kw })).toMatchObject({ canPropose: false, reason: "no-matching-pattern" });
  });

  it.each([0.7, 1.3])("accepts the ±30%% magnitude boundary %.1f before evaluating heat", (kw) => {
    expect(analyze({ step: () => kw })).toMatchObject({ canPropose: false, reason: "no-heat-association" });
    expect(analyze({ step: () => kw + (kw < 1 ? -0.001 : 0.001) })).toMatchObject({ reason: "no-matching-pattern" });
  });

  it("requires the same window on at least 70% of complete nights", () => {
    expect(analyze({ nights: 10, window: (i) => i < 7 ? { start: 22, end: 30 } : null })).toMatchObject({ canPropose: true });
    expect(analyze({ nights: 11, window: (i) => i < 7 ? { start: 22, end: 30 } : null }))
      .toMatchObject({ canPropose: false, reason: "ambiguous-pattern" });
  });

  it("does not zero-fill a missing daytime or nighttime hour", () => {
    for (const missingHour of [12, 24]) {
      const data = patternFixture();
      const rows = data.rows.filter((_, i) => (10 + i % 24) !== missingHour);
      expect(analyzeAirconPattern(rows, data.range, 1, data.weather)).toMatchObject({ reason: "insufficient-readings" });
    }
  });

  it("requires weather on both dates of the proposed night", () => {
    const data = patternFixture({ nights: 7 });
    expect(analyzeAirconPattern(data.rows, data.range, 1, data.weather.slice(0, -1)))
      .toMatchObject({ canPropose: false, reason: "insufficient-weather", coverage: { heatMatchedNights: 6 } });
  });

  it("suppresses flat, inverse, and weak heat associations", () => {
    expect(analyze({ temperatures: Array(15).fill(28) })).toMatchObject({ reason: "no-heat-association" });
    expect(analyze({ step: () => 1 })).toMatchObject({ reason: "no-heat-association" });
    expect(analyze({ step: (heat) => 1 - (heat - 27) * 0.06 })).toMatchObject({ reason: "no-heat-association" });
    expect(analyze({ step: (heat) => 1 + (heat - 27) * 0.01 })).toMatchObject({ reason: "no-heat-association" });
    expect(analyze({ step: (heat, night) => 1 + (heat - 27) * 0.03 + (night % 2 ? 0.15 : -0.15) }))
      .toMatchObject({ reason: "no-heat-association" });
  });

  it("accepts a 1°C span and a 0.02 kW/°C slope at their boundaries", () => {
    expect(analyze({ nights: 7, temperatures: Array.from({ length: 8 }, (_, i) => 26 + i / 6) })).toMatchObject({ canPropose: true });
    expect(analyze({ nights: 7, temperatures: Array.from({ length: 8 }, (_, i) => 26 + i / 7) })).toMatchObject({ reason: "no-heat-association" });
    expect(analyze({ nights: 7, temperatures: Array.from({ length: 8 }, (_, i) => 26 + i * 0.5),
      step: (heat) => 1 + (heat - 27) * 0.02 })).toMatchObject({ canPropose: true });
  });

  it("rejects clipped or overlapping plateaus rather than assigning an appliance", () => {
    expect(analyze({ window: () => ({ start: 18, end: 30 }) })).toMatchObject({ canPropose: false });
    const data = patternFixture();
    // A second load overlaps the first half of every night, destroying its sustained step shape.
    data.rows.forEach((row, i) => { if (10 + i % 24 >= 22 && 10 + i % 24 < 26) row.wh += 1500; });
    expect(analyzeAirconPattern(data.rows, data.range, 1, data.weather)).toMatchObject({ canPropose: false });
  });
});
