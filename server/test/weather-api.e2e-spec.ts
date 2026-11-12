import { describe, expect, it } from "vitest";
import { harness } from "./utils/test-harness.js";

const SMART = "9876543210"; // owner-a
const FOREIGN = "5555555555"; // owner-b
const dailyWeather = {
  [SMART]: [
    { date: "2026-11-01", temperatureC: 28.4338 },
    { date: "2026-11-02", temperatureC: 26 },
    { date: "2026-11-03", temperatureC: 21.5 },
  ],
};

describe("GET /api/rate-schedules/:period", () => {
  it("returns one month's charges and what one more kWh costs", async () => {
    const api = await harness();
    const { status, body } = await api.get("/api/rate-schedules/2026-10");
    expect(status).toBe(200);
    // Harness schedule: ₱11/kWh split 60/40, ₱50 fixed.
    expect(body).toMatchObject({ currency: "PHP", period: "2026-10", perKwhTotal: 11, fixed: [{ code: "supply_fixed", amount: 50 }] });
    expect(body.perKwh.map((c: { code: string }) => c.code)).toEqual(["generation", "distribution"]);
    expect(body.lifeline.tiers).toHaveLength(2);
  });

  it("says which months exist when the month is unknown, and rejects a malformed month", async () => {
    const api = await harness();
    const missing = await api.get("/api/rate-schedules/2025-01");
    expect(missing.status).toBe(404);
    expect(missing.body.periods).toEqual(["2026-09", "2026-10"]);
    expect((await api.get("/api/rate-schedules/nov")).status).toBe(400);
    expect((await api.get("/api/rate-schedules/2026-13")).status).toBe(400);
  });
});

describe("GET /api/households/:sin/weather", () => {
  it("returns each day's temperature and cooling degree days for the Household's area", async () => {
    const api = await harness({ dailyWeather });
    const token = await api.login();
    const { status, body } = await api.get(`/api/households/${SMART}/weather?from=2026-11-01&to=2026-11-04`, token);
    expect(status).toBe(200);
    expect(body).toMatchObject({ sin: SMART, timeZone: "Asia/Manila", cddBaseC: 22, range: { from: "2026-11-01", to: "2026-11-04" } });
    expect(body.days).toEqual([
      { date: "2026-11-01", temperatureC: 28.43, cdd: 6.43 },
      { date: "2026-11-02", temperatureC: 26, cdd: 4 },
      // Cooler than 22 °C: no cooling needed, never negative.
      { date: "2026-11-03", temperatureC: 21.5, cdd: 0 },
    ]);
  });

  it("defaults to the 30 days up to today", async () => {
    const api = await harness({ dailyWeather, now: () => Date.parse("2026-11-13T09:00:00+08:00") });
    const { body } = await api.get(`/api/households/${SMART}/weather`, await api.login());
    expect(body.range).toEqual({ from: "2026-10-15", to: "2026-11-14" });
    expect(body.days).toHaveLength(3);
  });

  it("needs a login and a linked Household, and a sensible range", async () => {
    const api = await harness({ dailyWeather });
    expect((await api.get(`/api/households/${SMART}/weather`)).status).toBe(401);
    const token = await api.login();
    expect((await api.get(`/api/households/${FOREIGN}/weather`, token)).status).toBe(404);
    expect((await api.get(`/api/households/${SMART}/weather?from=2026-11-01`, token)).status).toBe(400);
    expect((await api.get(`/api/households/${SMART}/weather?from=2026-11-04&to=2026-11-01`, token)).status).toBe(400);
    expect((await api.get(`/api/households/${SMART}/weather?from=2025-01-01&to=2026-11-01`, token)).status).toBe(400);
    expect((await api.get(`/api/households/${SMART}/weather?from=2026-11-1&to=2026-11-04`, token)).status).toBe(400);
  });
});

describe("GET /api/weather/monthly", () => {
  it("returns CDD per day for each month, null where there is no data yet", async () => {
    const api = await harness({ weather: { "2026-09": 8, "2026-10": 10.456 } });
    const { status, body } = await api.get("/api/weather/monthly?from=2026-09&to=2026-11", await api.login());
    expect(status).toBe(200);
    expect(body.cddBaseC).toBe(22);
    // The test weather fake doesn't say where its values come from.
    expect(body.months).toEqual([
      { period: "2026-09", cddPerDay: 8, source: null },
      { period: "2026-10", cddPerDay: 10.46, source: null },
      { period: "2026-11", cddPerDay: null, source: null },
    ]);
  });

  it("needs a login and at most 24 months, in order", async () => {
    const api = await harness({ weather: {} });
    expect((await api.get("/api/weather/monthly?from=2026-09&to=2026-11")).status).toBe(401);
    const token = await api.login();
    expect((await api.get("/api/weather/monthly?from=2026-11&to=2026-09", token)).status).toBe(400);
    expect((await api.get("/api/weather/monthly?from=2024-01&to=2026-11", token)).status).toBe(400);
    expect((await api.get("/api/weather/monthly?from=2026-09", token)).status).toBe(400);
  });
});

describe("Open-Meteo monthly heat source", () => {
  it("marks months from Open-Meteo as observed and the fallback table as sample", async () => {
    const { OpenMeteoWeatherProvider } = await import("../src/weather/open-meteo-weather.provider.js");
    const { vi } = await import("vitest");
    // Every day 27.5 °C: 5.5 CDD a day at base 22 °C. November fails, as a month still running would.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("start_date=2026-11")
      ? new Response("{}", { status: 400 })
      : new Response(JSON.stringify({ daily: { temperature_2m_mean: [27.5, 27.5] } }), { status: 200 })));
    try {
      const provider = new OpenMeteoWeatherProvider();
      expect(await provider.getCddPerDay("2026-10")).toBe(5.5);
      expect(provider.cddSource("2026-10")).toBe("observed");
      expect(await provider.getCddPerDay("2026-11")).toBe(3.9); // the sample fallback table
      expect(provider.cddSource("2026-11")).toBe("sample");
      expect(provider.cddSource("2026-12")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
