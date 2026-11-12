import { describe, expect, it } from "vitest";
import { bill, harness, schedule } from "./utils/test-harness.js";
import { FakeWeatherProvider } from "../src/weather/fake-weather.provider.js";

const sum = (effects: { amount: number }[]) => effects.reduce((s, e) => s + e.amount, 0);
const findEffect = (body: any, key: string) => body.effects.find((e: any) => e.key === key);
const amount = (body: any, key: string) => findEffect(body, key).amount;

describe("04 · Heat Sensitivity and Weather Effect", () => {
  it("API test with a fake weather provider: known synthetic history recovers the expected sensitivity", async () => {
    const knownSensitivity = 2.5;
    const baseDaily = 8;
    const months = [
      { period: "2025-12", billingDays: 31, cdd: 3.0 },
      { period: "2026-01", billingDays: 31, cdd: 3.2 },
      { period: "2026-02", billingDays: 28, cdd: 3.5 },
      { period: "2026-03", billingDays: 31, cdd: 4.2 },
      { period: "2026-04", billingDays: 30, cdd: 5.5 },
      { period: "2026-05", billingDays: 31, cdd: 6.0 },
      { period: "2026-06", billingDays: 30, cdd: 5.0 },
      { period: "2026-07", billingDays: 31, cdd: 4.8 },
      { period: "2026-08", billingDays: 31, cdd: 4.5 },
      { period: "2026-09", billingDays: 30, cdd: 4.3 },
      { period: "2026-10", billingDays: 31, cdd: 4.0 },
      { period: "2026-11", billingDays: 30, cdd: 3.8 },
    ];

    const weatherTable: Record<string, number> = {};
    for (const m of months) weatherTable[m.period] = m.cdd;

    const bills = months.map((m) =>
      bill(m.period, Math.round((baseDaily + knownSensitivity * m.cdd) * m.billingDays), m.billingDays),
    );

    const api = await harness({
      schedules: months.map((m) => schedule(m.period, 10)),
      bills: { "1234567890": bills },
      weather: new FakeWeatherProvider(weatherTable),
    });

    const token = await api.login();
    const { status, body } = await api.get("/api/households/1234567890/bakit-ganito", token);

    expect(status).toBe(200);
    expect(body.weatherDetail).toBeDefined();
    expect(body.weatherDetail.source).toBe("history");
    expect(body.weatherDetail.heatSensitivity).toBe(knownSensitivity);
    expect(body.weatherDetail.hotDayKwh).toBe(knownSensitivity);

    const weatherEffect = findEffect(body, "weather");
    expect(weatherEffect).toBeDefined();
    expect(weatherEffect.estimate).toBe(true);
    expect(weatherEffect.sensitivity).toBe(knownSensitivity);
    expect(weatherEffect.hotDayKwh).toBe(knownSensitivity);
  });

  it("Weather Effect appears and the four effects still sum exactly", async () => {
    const weather = { "2026-09": 3.0, "2026-10": 5.0 };
    const api = await harness({
      schedules: [schedule("2026-09", 10), schedule("2026-10", 10)],
      weather,
    });

    const { status, body } = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-09", 200, 30),
      now: bill("2026-10", 250, 30),
    });

    expect(status).toBe(200);
    expect(amount(body, "weather")).toBeGreaterThan(0);
    expect(sum(body.effects)).toBe(body.total);
    expect(body.total).toBe(body.now.rebuiltTotal - body.before.rebuiltTotal);
  });

  it("Weather Effect is labelled as an estimate and can be negative", async () => {
    // 2026-10 was hotter (5.0 CDD), 2026-11 was cooler (3.0 CDD) -> negative weather effect
    const weather = { "2026-10": 5.0, "2026-11": 3.0 };
    const api = await harness({
      schedules: [schedule("2026-10", 10), schedule("2026-11", 10)],
      weather,
    });

    const { status, body } = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-10", 250, 30),
      now: bill("2026-11", 200, 30),
    });

    expect(status).toBe(200);
    const weatherEffect = findEffect(body, "weather");
    expect(weatherEffect).toBeDefined();
    expect(weatherEffect.estimate).toBe(true);
    expect(weatherEffect.label).toContain("tantya");
    expect(weatherEffect.amount).toBeLessThan(0);
    expect(sum(body.effects)).toBe(body.total);
  });

  it("Fallback path works with no Bill History (uses Cooling Appliance estimate)", async () => {
    const weather = { "2026-09": 3.5, "2026-10": 4.5 };
    const api = await harness({
      schedules: [schedule("2026-09", 10), schedule("2026-10", 10)],
      weather,
    });

    // Public scan / manual entry without login (no history)
    const { status, body } = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-09", 180, 30),
      now: bill("2026-10", 210, 30),
    });

    expect(status).toBe(200);
    expect(body.weatherDetail).toBeDefined();
    expect(body.weatherDetail.source).toBe("cooling_appliance_estimate");
    expect(body.weatherDetail.heatSensitivity).toBe(1.0);
    expect(body.weatherDetail.hotDayKwh).toBe(1.0);
    expect(body.weatherDetail.label).toBe("Cooling Appliance estimate");

    const weatherEffect = findEffect(body, "weather");
    expect(weatherEffect.sensitivitySource).toBe("cooling_appliance_estimate");
    expect(weatherEffect.estimate).toBe(true);
    expect(amount(body, "weather")).toBeGreaterThan(0);
    expect(sum(body.effects)).toBe(body.total);
  });
});
