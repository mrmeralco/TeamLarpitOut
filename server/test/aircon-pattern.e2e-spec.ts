import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { MockReadingSource } from "../src/smart-meter/mock-reading-source.provider.js";
import { inMemoryReadingSource } from "../src/smart-meter/reading-source.interface.js";
import { MockDailyWeatherProvider } from "../src/weather/mock-daily-weather.provider.js";
import { inMemoryDailyWeatherSource } from "../src/weather/daily-weather-source.interface.js";
import { ownerIdForEmail, SESSION_IDLE_MS } from "../src/auth/auth.service.js";
import { patternFixture } from "./utils/aircon-pattern-fixture.js";
import { bill, harness, testAccounts, testLogins } from "./utils/test-harness.js";

const SMART = "9876543210";
const path = (sin = SMART) => `/api/households/${sin}/appliances/aircon-pattern-proposal`;
const label = { consumptionKwh: 270, period: "monthly", referenceDays: 30, referenceHoursPerDay: 9, confirmed: true };
async function setup(options: Parameters<typeof patternFixture>[0] = {}) {
  const fixture = patternFixture(options);
  const memory = inMemoryReadingSource({ [SMART]: fixture.rows });
  const source = { describe: vi.fn(memory.describe), readings: vi.fn(memory.readings) };
  const weather = inMemoryDailyWeatherSource({ [SMART]: fixture.weather });
  const daily = { daily: vi.fn(weather.daily) };
  const api = await harness({ readingSource: source, dailyWeatherSource: daily, bills: { [SMART]: [bill("2026-10", 240, 30)] } });
  return { api, token: await api.login(), source, daily, fixture };
}

describe("POST aircon-pattern-proposal", () => {
  it("uses fake sources, returns a tentative actual window, and never writes appliances", async () => {
    const { api, token, source, daily, fixture } = await setup({ window: () => ({ start: 21, end: 29 }) });
    const response = await request(api.app.getHttpServer()).post(path()).set("Authorization", `Bearer ${token}`).send({});
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({ status: "proposal", canPropose: true, timeZone: "Asia/Manila", hours: 8,
      routine: { start: "21:00", end: "05:00", days: "everyday" },
      provenance: { readings: { kind: "synthetic" }, weather: { kind: "synthetic" } } });
    expect(response.body.prompt).toContain("from 9 PM to 5 AM");
    expect(response.body.prompt).toContain("Is this the aircon?");
    expect(source.readings).toHaveBeenCalledWith(SMART, fixture.range);
    expect(daily.daily).toHaveBeenCalledWith(SMART, { from: "2026-11-01", to: "2026-11-16" });
    expect((await api.get(`/api/households/${SMART}/appliances`, token)).body.saved).toBe(false);
    const saved = await api.put(`/api/households/${SMART}/appliances`, { appliances: [{ type: "aircon", timeRanges: [response.body.routine] }] }, token);
    expect(saved.status).toBe(200);
    expect(saved.body.appliances[0].hoursPerDay).toBe(8);
    expect((await api.get(`/api/households/${SMART}/appliances/breakdown`, token)).body.totals.kwh).toBe(240);
  });

  it("recomputes label-first kW and quantity, ignoring client-derived values", async () => {
    const { api, token } = await setup();
    const answers = { mount: "window", inverter: "no", room: "large" };
    expect((await api.post(path(), { answers }, token)).body.canPropose).toBe(false);
    const response = await api.post(path(), { answers, energyLabel: { ...label, kwhPerHour: 999 }, expectedKw: 999 }, token);
    expect(response.body).toMatchObject({ canPropose: true, expectedKw: 1, ratingSource: "label" });
    expect((await api.post(path(), { quantity: 2, energyLabel: label }, token)).body.canPropose).toBe(false);
    const twice = await setup({ step: (heat) => 2 + (heat - 27) * 0.12 });
    expect((await twice.api.post(path(), { quantity: 2, energyLabel: label }, twice.token)).body).toMatchObject({ canPropose: true, expectedKw: 2 });
  });

  it.each([
    { quantity: 0 }, { quantity: null }, { quantity: "2" }, { answers: null }, { answers: { room: "giant" } },
    { answers: { room: {} } }, { energyLabel: null }, { energyLabel: { ...label, confirmed: false } },
    { energyLabel: { ...label, referenceHoursPerDay: 0 } }, { energyLabel: { ...label, referenceDays: -1 } },
  ])("rejects invalid draft %j before source access", async (input) => {
    const { api, token, source } = await setup();
    expect((await api.post(path(), input, token)).status).toBe(400);
    expect(source.describe).not.toHaveBeenCalled();
  });

  it("checks login, current Household access, and Meter Type before reading sources", async () => {
    const { api, token, source, daily } = await setup();
    expect((await api.post(path(), {})).status).toBe(401);
    expect((await api.post(path(), {}, "invalid")).status).toBe(401);
    for (const sin of ["5555555555", "unknown"]) expect((await api.post(path(sin), {}, token)).status).toBe(404);
    expect((await api.post(path("1234567890"), {}, token)).status).toBe(422);
    const foreign = await api.login("owner-b@example.test");
    expect((await api.post(path(), {}, foreign)).status).toBe(404);
    expect(source.describe).not.toHaveBeenCalled();
    expect(daily.daily).not.toHaveBeenCalled();
    await api.post("/api/auth/logout", {}, token);
    expect((await api.post(path(), {}, token)).status).toBe(401);
  });

  it("falls back for empty, partial, nonmatching, or heat-independent readings", async () => {
    const empty = await harness();
    expect((await empty.post(path(), {}, await empty.login())).body).toMatchObject({ status: "fallback", fallback: "routine" });
    for (const options of [{ nights: 6 }, { step: () => 0.5 }, { step: () => 1 }, { window: () => ({ start: 23, end: 26 }) }]) {
      const { api, token } = await setup(options);
      expect((await api.post(path(), {}, token)).body).toMatchObject({ canPropose: false, fallback: "routine" });
    }
    const { api, token, source, fixture } = await setup();
    source.readings.mockResolvedValue(fixture.rows.filter((_, i) => i % 24 !== 14));
    expect((await api.post(path(), {}, token)).body.reason).toBe("insufficient-readings");
  });

  it("rechecks current membership and server Meter Type, and rejects expired sessions", async () => {
    const memory = inMemoryReadingSource();
    const describe = vi.fn(memory.describe);
    let meterType: "smart" | "traditional" = "traditional";
    let now = 0;
    const account = () => ({ can: "1000000002", sin: SMART, area: "City", meter_type: meterType });
    const api = await harness({ readingSource: { describe, readings: memory.readings }, clock: { now: () => now }, meralco: {
      findByCan: async () => account(),
      household: async (sin) => (sin === SMART ? account() : null),
    } });
    const token = await api.login();
    expect((await api.post(path(), { meter_type: "smart" }, token)).status).toBe(422);
    meterType = "smart";
    const link = (await api.links.forOwner(ownerIdForEmail(testLogins[0]!.email))).find((l) => l.sin === SMART)!;
    await api.links.remove(link.ownerId, SMART);
    expect((await api.post(path(), {}, token)).status).toBe(404);
    await api.links.save(link); now = SESSION_IDLE_MS;
    expect((await api.post(path(), {}, token)).status).toBe(401);
    expect(describe).not.toHaveBeenCalled();
  });

  it("isolates proposal evidence between two linked smart Households", async () => {
    const second = "1111111111";
    const accounts = [...testAccounts, { can: "1000000011", sin: second, area: "Other City", meter_type: "smart" as const }];
    const fixture = patternFixture();
    const nonmatching = patternFixture({ step: () => 0.4 });
    const api = await harness({ accounts, links: { [testLogins[0]!.email]: [SMART, second] },
      readings: { [SMART]: fixture.rows, [second]: nonmatching.rows },
      dailyWeather: { [SMART]: fixture.weather, [second]: nonmatching.weather } });
    const token = await api.login();
    const first = await api.post(path(), {}, token);
    expect(first.body.canPropose).toBe(true);
    expect((await api.post(path(second), {}, token)).body.canPropose).toBe(false);
    expect(await api.post(path(), {}, token)).toEqual(first);
  });

  it("falls back for missing, failed, malformed, or incompatible daily weather", async () => {
    const { api, token, daily } = await setup();
    const original = await daily.daily(SMART, { from: "2026-11-01", to: "2026-11-16" });
    daily.daily.mockResolvedValue({ ...original, days: [] });
    expect((await api.post(path(), {}, token)).body.reason).toBe("insufficient-weather");
    for (const malformed of [
      { ...original, days: [...original.days, original.days[0]!] },
      { ...original, days: [{ date: "2026-02-30", temperatureC: 28 }] },
      { ...original, provenance: { kind: "observed" as const, note: "Unrelated observed weather" } },
    ]) {
      daily.daily.mockResolvedValue(malformed);
      expect((await api.post(path(), {}, token)).body.reason).toBe("weather-unavailable");
    }
    daily.daily.mockRejectedValue(new Error("private weather details"));
    expect((await api.post(path(), {}, token)).body).toMatchObject({ canPropose: false, reason: "weather-unavailable",
      coverage: { completeNights: 14, matchingNights: 14, heatMatchedNights: 0 } });
  });

  it("maps failed metadata/readings and malformed hourly rows to 502", async () => {
    const { api, token, source, fixture } = await setup();
    source.describe.mockResolvedValueOnce({ available: { from: "invalid", to: fixture.range.to },
      provenance: { kind: "synthetic", note: "Invalid source window" } });
    expect((await api.post(path(), {}, token)).status).toBe(502);
    for (const rows of [[{ ...fixture.rows[0]!, wh: -1 }], [fixture.rows[0]!, fixture.rows[0]!]]) {
      source.readings.mockResolvedValue(rows);
      expect((await api.post(path(), {}, token)).status).toBe(502);
    }
    source.readings.mockRejectedValue(new Error("private readings details"));
    expect((await api.post(path(), {}, token)).status).toBe(502);
    source.describe.mockRejectedValue(new Error("private metadata details"));
    expect((await api.post(path(), {}, token)).status).toBe(502);
  });

  it("bounds analysis to 30 available days and pairs the default simulated sources", async () => {
    const source = new MockReadingSource();
    const readings = vi.spyOn(source, "readings");
    const api = await harness({ readingSource: source, dailyWeatherSource: new MockDailyWeatherProvider() });
    const result = await api.post(path(), {}, await api.login());
    expect(result.body).toMatchObject({ canPropose: true, routine: { start: "22:00", end: "06:00" } });
    const range = readings.mock.calls[0]![1];
    expect(Date.parse(range.to) - Date.parse(range.from)).toBe(30 * 24 * 60 * 60 * 1000);
    expect(result.body.provenance.weather.kind).toBe("synthetic");
  });
});
