import { describe, expect, it } from "vitest";
import type { Bill } from "../src/domain/bill.js";
import { FakeWeatherProvider } from "../src/weather/fake-weather.provider.js";
import { bill, harness, schedule } from "./utils/test-harness.js";

const SIN = "1234567890"; // traditional meter household (owner-a)
const FOREIGN_SIN = "5555555555"; // owner-b

// 12-month bill history with presentReading
const history = (): Bill[] => [
  { period: "2025-11", kwh: 200, billingDays: 30, previousReading: 10000, presentReading: 10200 },
  { period: "2025-12", kwh: 210, billingDays: 31, previousReading: 10200, presentReading: 10410 },
  { period: "2026-01", kwh: 200, billingDays: 31, previousReading: 10410, presentReading: 10610 },
  { period: "2026-02", kwh: 190, billingDays: 28, previousReading: 10610, presentReading: 10800 },
  { period: "2026-03", kwh: 220, billingDays: 31, previousReading: 10800, presentReading: 11020 },
  { period: "2026-04", kwh: 260, billingDays: 30, previousReading: 11020, presentReading: 11280 },
  { period: "2026-05", kwh: 280, billingDays: 31, previousReading: 11280, presentReading: 11560 },
  { period: "2026-06", kwh: 250, billingDays: 30, previousReading: 11560, presentReading: 11810 },
  { period: "2026-07", kwh: 240, billingDays: 31, previousReading: 11810, presentReading: 12050 },
  { period: "2026-08", kwh: 230, billingDays: 31, previousReading: 12050, presentReading: 12280 },
  { period: "2026-09", kwh: 220, billingDays: 30, previousReading: 12280, presentReading: 12500 },
  { period: "2026-10", kwh: 240, billingDays: 30, previousReading: 12500, presentReading: 12740 },
];

const cddHistory: Record<string, number> = {
  "2025-11": 3.0,
  "2025-12": 3.1,
  "2026-01": 3.0,
  "2026-02": 3.5,
  "2026-03": 4.2,
  "2026-04": 5.5,
  "2026-05": 6.0,
  "2026-06": 5.0,
  "2026-07": 4.5,
  "2026-08": 4.2,
  "2026-09": 3.8,
  "2026-10": 4.0,
  "2026-11": 4.5,
};

async function setup(weatherProvider?: FakeWeatherProvider) {
  const weather = weatherProvider ?? new FakeWeatherProvider(cddHistory);
  const api = await harness({
    schedules: [schedule("2026-10", 10), schedule("2026-11", 10)],
    bills: { [SIN]: history() },
    weather,
  });
  const token = await api.login();
  return { api, token };
}

describe("16 · Forecast: range, typed Mid-month Reading, heat wave banner", () => {
  it("AC1 & AC3: Before reading, returns a range; after reading, narrows to a single figure", async () => {
    const { api, token } = await setup();

    // 1. Before reading: returns Forecast range
    const initial = await api.get(`/api/households/${SIN}/forecast`, token);
    expect(initial.status).toBe(200);
    expect(initial.body.period).toBe("2026-11");
    expect(initial.body.hasReading).toBe(false);
    expect(initial.body.projected).toBeNull();
    expect(initial.body.range).toBeDefined();
    expect(initial.body.range.minPesos).toBeGreaterThan(0);
    expect(initial.body.range.maxPesos).toBeGreaterThan(initial.body.range.minPesos);
    expect(initial.body.range.maxKwh).toBeGreaterThan(initial.body.range.minKwh);
    expect(initial.body.lastReading).toBe(12740);

    // 2. Type Mid-month Reading
    // Latest bill presentReading was 12740. Suppose user types 12860 on day 15 (120 kWh so far).
    const saveRes = await api.post(
      `/api/households/${SIN}/mid-month-reading`,
      { reading: 12860, elapsedDays: 15 },
      token,
    );
    expect(saveRes.status).toBe(201);
    expect(saveRes.body.hasReading).toBe(true);
    expect(saveRes.body.range).toBeNull();
    expect(saveRes.body.projected).toBeDefined();
    expect(saveRes.body.projected.reading).toBe(12860);
    expect(saveRes.body.projected.kwhSoFar).toBe(120);
    expect(saveRes.body.projected.elapsedDays).toBe(15);
    expect(saveRes.body.projected.remainingDays).toBe(15);
    expect(saveRes.body.projected.kwh).toBeGreaterThan(120);
    expect(saveRes.body.projected.pesos).toBeGreaterThan(0);

    // 3. GET /forecast now returns the single figure
    const after = await api.get(`/api/households/${SIN}/forecast`, token);
    expect(after.status).toBe(200);
    expect(after.body.hasReading).toBe(true);
    expect(after.body.range).toBeNull();
    expect(after.body.projected).toEqual(saveRes.body.projected);

    // 4. Deleting the reading resets back to range
    const del = await api.put && (await (api as any).app.getHttpServer());
    const delRes = await (await import("supertest")).default(del)
      .delete(`/api/households/${SIN}/mid-month-reading`)
      .set("Authorization", `Bearer ${token}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.hasReading).toBe(false);
    expect(delRes.body.range).toBeDefined();
    expect(delRes.body.projected).toBeNull();
  });

  it("AC2: Heat wave banner appears and raises the forecast when heat index indicates extreme heat", async () => {
    // Normal weather provider:
    const normalWeather = new FakeWeatherProvider(cddHistory);
    normalWeather.setForecast("2026-11", { cddPerDay: 4.5, heatIndexMax: 36.0, isHeatWave: false });
    const { api: normalApi, token: normalToken } = await setup(normalWeather);
    const normalRes = await normalApi.get(`/api/households/${SIN}/forecast`, normalToken);
    expect(normalRes.body.heatWave.active).toBe(false);
    expect(normalRes.body.heatWave.banner).toBeNull();
    const normalMinPesos = normalRes.body.range.minPesos;
    const normalMaxPesos = normalRes.body.range.maxPesos;

    // Heat wave weather provider:
    const heatWaveWeather = new FakeWeatherProvider(cddHistory);
    heatWaveWeather.setForecast("2026-11", { cddPerDay: 6.5, heatIndexMax: 43.5, isHeatWave: true });
    const { api: heatApi, token: heatToken } = await setup(heatWaveWeather);
    const heatRes = await heatApi.get(`/api/households/${SIN}/forecast`, heatToken);

    // Banner must be active and cite the extreme heat
    expect(heatRes.body.heatWave.active).toBe(true);
    expect(heatRes.body.heatWave.heatIndex).toBe(43.5);
    expect(heatRes.body.heatWave.banner).toContain("Babala sa Heat Wave");
    expect(heatRes.body.heatWave.banner).toContain("43.5°C");

    // Heat wave must raise the forecast compared to normal weather
    expect(heatRes.body.range.minPesos).toBeGreaterThan(normalMinPesos);
    expect(heatRes.body.range.maxPesos).toBeGreaterThan(normalMaxPesos);
  });

  it("AC3: Compares projected single figure with Target (within target and over target)", async () => {
    const { api, token } = await setup();

    // Set appliances first so usage-plan can calculate missions and save
    await api.put(
      `/api/households/${SIN}/appliances`,
      {
        appliances: [
          { type: "refrigerator" },
          { type: "aircon", answers: { mount: "split", inverter: "yes", room: "medium" }, timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }] },
        ],
      },
      token,
    );

    // Set a 10% Target plan with an available mission
    const missionsRes = await api.get(`/api/households/${SIN}/missions`, token);
    const missionIds = [missionsRes.body.missions[0].id];
    const planRes = await api.put(`/api/households/${SIN}/usage-plan`, { cut: 10, missionIds }, token);
    expect(planRes.status).toBe(200);

    // Case A: Low reading (12780 = only 40 kWh used in 15 days) -> within target
    const withinRes = await api.post(
      `/api/households/${SIN}/mid-month-reading`,
      { reading: 12780, elapsedDays: 15 },
      token,
    );
    expect(withinRes.body.targetComparison).toBeDefined();
    expect(withinRes.body.targetComparison.status).toBe("within_target");
    expect(withinRes.body.targetComparison.label).toContain("Pasok sa target");
    expect(withinRes.body.targetComparison.diffPesos).toBeLessThanOrEqual(0);

    // Case B: High reading (12980 = 240 kWh used in 15 days) -> over target
    const overRes = await api.post(
      `/api/households/${SIN}/mid-month-reading`,
      { reading: 12980, elapsedDays: 15 },
      token,
    );
    expect(overRes.body.targetComparison).toBeDefined();
    expect(overRes.body.targetComparison.status).toBe("over_target");
    expect(overRes.body.targetComparison.label).toContain("Lalampas sa target");
    expect(overRes.body.targetComparison.diffPesos).toBeGreaterThan(0);
  });

  it("Validates that reading cannot be less than previous bill presentReading", async () => {
    const { api, token } = await setup();
    // Latest bill presentReading is 12740. Entering 12000 is invalid.
    const res = await api.post(
      `/api/households/${SIN}/mid-month-reading`,
      { reading: 12000 },
      token,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hindi maaaring mas mababa");
  });

  it("Requires authentication and owner household access", async () => {
    const { api, token } = await setup();
    // Unauthenticated
    const unauth = await api.get(`/api/households/${SIN}/forecast`);
    expect(unauth.status).toBe(401);

    // Foreign SIN (owner-a attempting to access foreign household): returns 404 to avoid disclosing household existence
    const foreign = await api.get(`/api/households/${FOREIGN_SIN}/forecast`, token);
    expect(foreign.status).toBe(404);
  });
});
