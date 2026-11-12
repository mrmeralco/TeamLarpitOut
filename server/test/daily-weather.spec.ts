import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { DAILY_WEATHER_SOURCE, DATABASE, READING_SOURCE, WEATHER_PROVIDER } from "../src/common/injection-tokens.js";
import { DAY_MS, HOUR_MS } from "../src/domain/meter-reading.js";
import { MockReadingSource } from "../src/smart-meter/mock-reading-source.provider.js";
import type { ReadingSource } from "../src/smart-meter/reading-source.interface.js";
import { inMemoryDailyWeatherSource, type DailyWeatherSource } from "../src/weather/daily-weather-source.interface.js";
import { MockDailyWeatherProvider } from "../src/weather/mock-daily-weather.provider.js";
import type { WeatherProvider } from "../src/weather/weather-provider.interface.js";
import { WeatherModule } from "../src/weather/weather.module.js";
import { harness } from "./utils/test-harness.js";

/** No DATABASE_URL: modules fall back to their in-code sources. */
@Global()
@Module({ providers: [{ provide: DATABASE, useValue: null }], exports: [DATABASE] })
class NoDatabase {}

const SMART = "9876543210";
const RANGE = { from: "2026-11-01", to: "2026-11-03" };

describe("daily demo weather", () => {
  it("exports the daily source through WeatherModule independently of monthly weather", async () => {
    const module = await Test.createTestingModule({
      imports: [NoDatabase, WeatherModule],
      providers: [{
        provide: "daily-consumer",
        inject: [DAILY_WEATHER_SOURCE],
        useFactory: (source: DailyWeatherSource) => source,
      }],
    }).compile();
    try {
      const source = module.get<DailyWeatherSource>("daily-consumer");
      expect(source).toBeInstanceOf(MockDailyWeatherProvider);
      expect((await source.daily(SMART, RANGE)).days).toHaveLength(2);
      expect(module.get(WEATHER_PROVIDER)).not.toBe(source);
    } finally {
      await module.close();
    }
  });

  it("returns deterministic, unrounded temperatures and explicit synthetic provenance", async () => {
    const source = new MockDailyWeatherProvider();
    const result = await source.daily(SMART, RANGE);
    expect(result).toMatchObject({
      timeZone: "Asia/Manila",
      range: RANGE,
      available: { from: "2025-12-01", to: "2026-12-01" },
      coverage: { requestedDays: 2, returnedDays: 2 },
      provenance: { kind: "synthetic", note: expect.stringContaining("not weather observations") },
    });
    expect(result.days.map((day) => day.date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(result.days[0]!.temperatureC).toBeCloseTo(28.433883739117558, 12);
    expect(result.days[1]!.temperatureC).toBeCloseTo(28.78183148246803, 12);
    expect(await source.daily(SMART, RANGE)).toEqual(result);
    expect(await new MockDailyWeatherProvider().daily(SMART, RANGE)).toEqual(result);
  });

  it("aligns daily heat with every overnight reading across the full simulation", async () => {
    const weather = await new MockDailyWeatherProvider().daily(SMART, { from: "2025-12-01", to: "2026-12-01" });
    const readings = await new MockReadingSource().readings(SMART, {
      from: "2025-12-01T00:00:00+08:00", to: "2026-12-01T00:00:00+08:00",
    });
    expect(weather.coverage).toEqual({ requestedDays: 365, returnedDays: 365 });
    const byDate = new Map(weather.days.map((day) => [day.date, day.temperatureC]));
    for (const row of readings) {
      const local = new Date(Date.parse(row.from) + 8 * HOUR_MS);
      const temperature = byDate.get(local.toISOString().slice(0, 10));
      expect(temperature).toBeDefined();
      const hour = local.getUTCHours();
      if (hour >= 22 || hour < 6) {
        // This synthetic Household has 145 Wh of base load, plus night cooling.
        expect(row.wh).toBe(Math.round(145 + 600 + Math.max(0, temperature! - 24) * 65));
      }
    }
  });

  it("uses the Manila date on both sides of local midnight and month/year boundaries", async () => {
    const source = new MockDailyWeatherProvider();
    const result = await source.daily(SMART, { from: "2025-12-31", to: "2026-01-02" });
    expect(result.days.map((day) => day.date)).toEqual(["2025-12-31", "2026-01-01"]);
    // 15:00Z and 16:00Z straddle Manila midnight, not UTC midnight.
    const readings = await new MockReadingSource().readings(SMART, {
      from: "2025-12-31T15:00:00Z", to: "2025-12-31T17:00:00Z",
    });
    expect(readings.map((row) => row.wh)).toEqual(result.days.map((day) =>
      Math.round(145 + 600 + Math.max(0, day.temperatureC - 24) * 65)));
  });

  it.each([
    ["2025-11-30", "2025-12-02", ["2025-12-01"]],
    ["2026-11-30", "2026-12-02", ["2026-11-30"]],
    ["2025-11-01", "2025-12-01", []],
    ["2026-12-01", "2026-12-03", []],
  ])("reports coverage without inventing temperatures for %s through %s", async (from, to, expectedDates) => {
    const result = await new MockDailyWeatherProvider().daily(SMART, { from, to });
    expect(result.days.map((day) => day.date)).toEqual(expectedDates);
    expect(result.coverage).toEqual({
      requestedDays: (Date.parse(to) - Date.parse(from)) / DAY_MS,
      returnedDays: expectedDates.length,
    });
    expect(result.available).toEqual({ from: "2025-12-01", to: "2026-12-01" });
  });

  it.each(["1234567890", "unknown", "__proto__"])("has no daily weather for unsupported Household %s", async (sin) => {
    const result = await new MockDailyWeatherProvider().daily(sin, RANGE);
    expect(result).toMatchObject({ available: null, days: [], coverage: { requestedDays: 2, returnedDays: 0 } });
  });

  it.each([
    { from: "2026-02-30", to: "2026-03-02" },
    { from: "2026-11-01", to: "2026-02-29" },
    { from: "2026-11-01T00:00:00+08:00", to: "2026-11-03" },
    { from: "invalid", to: "2026-11-03" },
    { from: "2026-11-03", to: "2026-11-03" },
    { from: "2026-11-04", to: "2026-11-03" },
  ])("rejects invalid calendar range %j", async (range) => {
    await expect(new MockDailyWeatherProvider().daily(SMART, range)).rejects.toThrow(RangeError);
  });

  it("returns isolated snapshots of range, metadata, and temperatures", async () => {
    const source = new MockDailyWeatherProvider();
    const range = { ...RANGE };
    const expected = await source.daily(SMART, range);
    const result = await source.daily(SMART, range);
    result.days[0]!.temperatureC = -100;
    result.days.push({ date: "2026-11-03", temperatureC: 100 });
    result.available!.from = "1900-01-01";
    result.provenance.kind = "observed";
    result.coverage.returnedDays = 999;
    result.range.from = "1900-01-01";
    expect(range).toEqual(RANGE);
    expect(await source.daily(SMART, range)).toEqual(expected);
  });
});

describe("daily weather test fixtures", () => {
  it("keeps sparse, unsorted input isolated per Household without filling missing days", async () => {
    const fixtures = {
      [SMART]: [{ date: "2026-11-03", temperatureC: 32 }, { date: "2026-11-01", temperatureC: 27 }],
      other: [{ date: "2026-11-01", temperatureC: 35 }],
    };
    const source = inMemoryDailyWeatherSource(fixtures);
    fixtures[SMART][0]!.temperatureC = -999;
    const result = await source.daily(SMART, { from: "2026-11-01", to: "2026-11-04" });
    expect(result.days).toEqual([{ date: "2026-11-01", temperatureC: 27 }, { date: "2026-11-03", temperatureC: 32 }]);
    expect(result.coverage).toEqual({ requestedDays: 3, returnedDays: 2 });
    expect((await source.daily("other", RANGE)).days).toEqual([{ date: "2026-11-01", temperatureC: 35 }]);
    expect((await source.daily("unknown", RANGE)).available).toBeNull();
  });

  it("overrides daily heat independently of readings and monthly CDD in the API harness", async () => {
    const options = {
      readings: { [SMART]: [{ from: "2026-11-01T00:00:00+08:00", wh: 1234 }] },
      weather: { "2026-11": 4.5 },
    };
    const api = await harness({ ...options, dailyWeather: { [SMART]: [{ date: "2026-11-01", temperatureC: 29 }] } });
    const changed = await harness({ ...options, dailyWeather: { [SMART]: [{ date: "2026-11-01", temperatureC: 35 }] } });
    const daily = (app: typeof api.app) => app.get<DailyWeatherSource>(DAILY_WEATHER_SOURCE).daily(SMART, RANGE);
    expect((await daily(api.app)).days[0]!.temperatureC).toBe(29);
    expect((await daily(changed.app)).days[0]!.temperatureC).toBe(35);
    const interval = { from: "2026-11-01T00:00:00+08:00", to: "2026-11-01T01:00:00+08:00" };
    expect(await api.app.get<ReadingSource>(READING_SOURCE).readings(SMART, interval))
      .toEqual(await changed.app.get<ReadingSource>(READING_SOURCE).readings(SMART, interval));
    for (const app of [api.app, changed.app]) {
      expect(await app.get<WeatherProvider>(WEATHER_PROVIDER).getCddPerDay("2026-11")).toBe(4.5);
    }
  });

  it("accepts a custom daily source and defaults to empty data instead of demo heat", async () => {
    const custom = inMemoryDailyWeatherSource({ [SMART]: [{ date: "2026-11-01", temperatureC: 31 }] });
    const api = await harness({ dailyWeatherSource: custom });
    expect(api.app.get(DAILY_WEATHER_SOURCE)).toBe(custom);
    const empty = await harness();
    expect((await empty.app.get<DailyWeatherSource>(DAILY_WEATHER_SOURCE).daily(SMART, RANGE)).days).toEqual([]);
  });
});
