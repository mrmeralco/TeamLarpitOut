import { describe, expect, it } from "vitest";
import type { Bill } from "../src/domain/bill.js";
import { GeminiCoachProvider } from "../src/coach/gemini-coach.provider.js";
import { bill, harness, testLogins } from "./utils/test-harness.js";

const SIN = "1234567890"; // owner-a
const FOREIGN_SIN = "5555555555"; // owner-b

// Latest Bill: October, 240 kWh over 30 days at ₱11/kWh (₱6.60 + ₱4.40) and ₱50 fixed.
const history = (): Bill[] => [bill("2026-09", 210, 30), bill("2026-10", 240, 30)];
// November is forecast 2 CDD/day hotter than October.
const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 12 };

const survey = {
  appliances: [
    {
      type: "aircon",
      answers: { mount: "split", inverter: "yes", room: "medium" },
      timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }], // 8 h/day
    },
    { type: "refrigerator" },
    { type: "tv", answers: { size: "large" }, timeRanges: [{ start: "19:00", end: "23:00", days: "everyday" }] },
    { type: "lights", answers: { count: "some", led: "yes" }, timeRanges: [{ start: "18:00", end: "23:00", days: "everyday" }] },
    { type: "washing_machine", answers: { kind: "automatic" }, usesPerWeek: 3 },
    { type: "electric_fan", answers: { kind: "stand" }, timeRanges: [{ start: "13:00", end: "17:00", days: "everyday" }] },
  ],
};

async function setup(opts: Parameters<typeof harness>[0] = {}) {
  const api = await harness({ bills: { [SIN]: history() }, weather, ...opts });
  const token = await api.login();
  await api.put(`/api/households/${SIN}/appliances`, survey, token);
  await api.completeSetup(SIN, token);
  return { api, token };
}

const find = (missions: any[], id: string) => missions.find((m) => m.id === id);

describe("GET /api/households/:sin/target", () => {
  it("adjusts the Baseline for next month's weather and sets the fixed 5% Target in pesos", async () => {
    const { api, token } = await setup();
    const { status, body } = await api.get(`/api/households/${SIN}/target`, token);

    expect(status).toBe(200);
    expect(body.period).toBe("2026-11");
    expect(body.rateSchedulePeriod).toBe("2026-10");
    // 8 kWh/day + 1.0 kWh/CDD (no history yet: Cooling Appliance estimate) × 2 CDD = 10 kWh/day × 30 days.
    expect(body.baseline).toMatchObject({ kwh: 300, kwhPerDay: 10, weatherAdjusted: true, weatherKwhPerDay: 2, pesos: 335_000 });
    expect(body.baseline.heatSensitivity.source).toBe("cooling_appliance_estimate");
    expect(body.options).toEqual([{ cut: 5, kwh: 285, pesos: 318_500, savings: 16_500 }]);
  });

  it("falls back to the latest kWh per day when next month's weather is unknown", async () => {
    const { api, token } = await setup({ weather: { "2026-09": 8, "2026-10": 10 } });
    const { body } = await api.get(`/api/households/${SIN}/target`, token);
    expect(body.baseline).toMatchObject({ kwh: 240, weatherAdjusted: false, weatherKwhPerDay: 0 });
  });

  it("needs a Bill and the owner's login", async () => {
    const api = await harness({ weather });
    const token = await api.login();
    expect((await api.get(`/api/households/${SIN}/target`, token)).status).toBe(404);
    expect((await api.get(`/api/households/${SIN}/target`)).status).toBe(401);
    expect((await api.get(`/api/households/${FOREIGN_SIN}/target`, token)).status).toBe(404);
  });
});

describe("GET /api/households/:sin/missions", () => {
  it("keeps label ratings in hourly aircon and daily refrigerator units for Missions", async () => {
    const { api, token } = await setup();
    const saved = await api.put(`/api/households/${SIN}/appliances`, { appliances: [
      { ...survey.appliances[0], quantity: 2, energyLabel: {
        consumptionKwh: 270, period: "monthly", referenceDays: 30, referenceHoursPerDay: 9, confirmed: true,
      } },
      { type: "refrigerator", quantity: 3, energyLabel: {
        consumptionKwh: 30, period: "monthly", referenceDays: 30, confirmed: true,
      } },
      survey.appliances[5], // Stand fan, 0.06 kW.
    ] }, token);
    expect(saved.status).toBe(200);
    expect(saved.body.appliances.map((a: any) => a.estimatedKwhPerDay)).toEqual([16, 3, 0.24]);
    const breakdown = (await api.get(`/api/households/${SIN}/appliances/breakdown`, token)).body;
    const aircon = breakdown.rows.find((r: any) => r.type === "aircon").kwh;
    const ref = breakdown.rows.find((r: any) => r.type === "refrigerator").kwh;
    expect(aircon / ref).toBeCloseTo(16 / 3, 2);
    const { status, body } = await api.get(`/api/households/${SIN}/missions`, token);
    expect(status).toBe(200);
    expect(find(body.missions, "aircon-timer-2h").kwhSaved).toBe(Math.round(aircon / 4 * 100) / 100);
    expect(find(body.missions, "fan-first-hour").kwhSaved).toBe(Math.round((aircon / (8 * 30) - 0.06) * 30 * 100) / 100);
    expect(find(body.missions, "ref-medium").kwhSaved).toBe(Math.round(ref * 0.1 * 100) / 100);
  });

  it("ranks Missions by their computed peso value", async () => {
    const { api, token } = await setup();
    const { status, body } = await api.get(`/api/households/${SIN}/missions`, token);

    expect(status).toBe(200);
    expect(body.period).toBe("2026-11");
    expect(body.perKwhRate).toBe(11);
    const values = body.missions.map((m: any) => m.pesoValue);
    expect(values).toEqual([...values].sort((a: number, b: number) => b - a));
    expect(body.missions[0].appliance).toBe("aircon");
  });

  it("computes each Mission's kWh from the household's own calibrated appliances", async () => {
    const { api, token } = await setup();
    const breakdown = (await api.get(`/api/households/${SIN}/appliances/breakdown`, token)).body;
    const aircon = breakdown.rows.find((r: any) => r.type === "aircon").kwh;
    const { body } = await api.get(`/api/households/${SIN}/missions`, token);

    // Timer off 2 h earlier: 2 of the aircon's 8 hours.
    const timer = find(body.missions, "aircon-timer-2h");
    expect(timer).toMatchObject({ basis: "physics", assumptions: [] });
    expect(timer.kwhSaved).toBe(Math.round((aircon / 4) * 100) / 100);
    expect(timer.pesoValue).toBe(Math.round((aircon / 4) * 11 * 100));

    // Fan for the first hour: (aircon kW − stand fan 0.06 kW) × 1 h × 30 days.
    const fan = find(body.missions, "fan-first-hour");
    expect(fan.kwhSaved).toBe(Math.round((aircon / (8 * 30) - 0.06) * 30 * 100) / 100);

    // Not in the household's list → not offered.
    expect(find(body.missions, "iron-batch")).toBeUndefined();
  });

  it("labels assumption-based rates, and uses the household's aircon setting when given", async () => {
    const { api, token } = await setup();
    const aircon = (await api.get(`/api/households/${SIN}/appliances/breakdown`, token)).body.rows.find((r: any) => r.type === "aircon").kwh;

    const assumed = find((await api.get(`/api/households/${SIN}/missions`, token)).body.missions, "aircon-25c");
    expect(assumed.basis).toBe("assumption");
    expect(assumed.assumptions.map((a: any) => a.key)).toEqual(["airconPerDegree", "airconSetting"]);
    expect(assumed.kwhSaved).toBe(Math.round(aircon * 0.03 * 3 * 100) / 100); // 22°C → 25°C

    const told = find((await api.get(`/api/households/${SIN}/missions?airconSetting=24`, token)).body.missions, "aircon-25c");
    expect(told.assumptions.map((a: any) => a.key)).toEqual(["airconPerDegree"]);
    expect(told.kwhSaved).toBe(Math.round(aircon * 0.03 * 100) / 100);

    const already = (await api.get(`/api/households/${SIN}/missions?airconSetting=25`, token)).body.missions;
    expect(find(already, "aircon-25c")).toBeUndefined();

    expect((await api.get(`/api/households/${SIN}/missions?airconSetting=40`, token)).status).toBe(400);
  });

  it("never takes a peso value or ranking from the Coach, which only words the Mission", async () => {
    const plain = await setup();
    const reference = (await plain.api.get(`/api/households/${SIN}/missions`, plain.token)).body.missions;

    const liar = await setup({ coach: { phraseMission: async () => "Gawin mo ito at tipid ka ng ₱999,999!" } });
    const worded = (await liar.api.get(`/api/households/${SIN}/missions`, liar.token)).body.missions;

    expect(worded.map((m: any) => [m.id, m.kwhSaved, m.pesoValue])).toEqual(reference.map((m: any) => [m.id, m.kwhSaved, m.pesoValue]));
    expect(worded[0].message).toBe("Gawin mo ito at tipid ka ng ₱999,999!");
  });

  it("falls back to the template wording when the Coach fails", async () => {
    const { api, token } = await setup({ coach: { phraseMission: async () => Promise.reject(new Error("AI down")) } });
    const { status, body } = await api.get(`/api/households/${SIN}/missions`, token);
    expect(status).toBe(200);
    expect(body.missions[0].message).toMatch(/kWh ang matitipid mo/);
  });

  it("asks for the appliance list first", async () => {
    const api = await harness({ bills: { [SIN]: history() }, weather });
    const token = await api.login();
    expect((await api.get(`/api/households/${SIN}/missions`, token)).status).toBe(409);
  });
});

describe("Gemini Coach", () => {
  it("uses the template when no API key is configured", async () => {
    const coach = new GeminiCoachProvider("");
    expect(await coach.phraseMission({ id: "x", title: "Ref sa medium", kwhSaved: 3.5, pesoValue: 3_850 })).toBe(
      "Ref sa medium: mga 3.5 kWh ang matitipid mo, mga ₱38.50 sa susunod na Bill.",
    );
  });
});

describe("Household usage plan (Target + Missions for one billing period)", () => {
  it("saves the chosen cut and 1–3 Missions with their computed values", async () => {
    const { api, token } = await setup();
    const saved = await api.put(`/api/households/${SIN}/usage-plan`, { cut: 5, missionIds: ["aircon-timer-2h", "ref-medium"] }, token);

    expect(saved.status).toBe(200);
    expect(saved.body.active).toBe(true);
    expect(saved.body.plan).toMatchObject({ period: "2026-11", cut: 5, targetKwh: 285, targetPesos: 318_500, airconSetting: null });
    expect(saved.body.plan.missions.map((m: any) => m.id)).toEqual(["aircon-timer-2h", "ref-medium"]);

    const { body } = await api.get(`/api/households/${SIN}/usage-plan`, token);
    expect(body).toEqual(saved.body);
  });

  it("lasts one billing period: a newer Bill ends it", async () => {
    const bills = history();
    const api = await harness({ billSource: { bills: async () => bills }, weather });
    const token = await api.login();
    await api.put(`/api/households/${SIN}/appliances`, survey, token);
    await api.completeSetup(SIN, token);
    await api.put(`/api/households/${SIN}/usage-plan`, { cut: 5, missionIds: ["ref-medium"] }, token);

    bills.push(bill("2026-11", 250, 30));
    const { body } = await api.get(`/api/households/${SIN}/usage-plan`, token);
    expect(body.active).toBe(false);
    expect(body.plan.period).toBe("2026-11");
  });

  it("rejects cuts other than 5, more than 3 Missions, and Missions that don't apply", async () => {
    const { api, token } = await setup();
    const put = (body: unknown) => api.put(`/api/households/${SIN}/usage-plan`, body, token);

    expect((await put({ cut: 7, missionIds: ["ref-medium"] })).status).toBe(400);
    expect((await put({ cut: 10, missionIds: ["ref-medium"] })).status).toBe(400);
    expect((await put({ cut: 15, missionIds: ["ref-medium"] })).status).toBe(400);
    expect((await put({ cut: 5, missionIds: [] })).status).toBe(400);
    expect((await put({ cut: 5, missionIds: ["ref-medium", "aircon-25c", "aircon-timer-2h", "lights-off"] })).status).toBe(400);
    expect((await put({ cut: 5, missionIds: ["ref-medium", "ref-medium"] })).status).toBe(400);
    const notHere = await put({ cut: 5, missionIds: ["iron-batch"] });
    expect(notHere.status).toBe(400);
    expect(notHere.body.issues).toEqual(["iron-batch"]);

    expect((await api.get(`/api/households/${SIN}/usage-plan`, token)).body).toEqual({ active: false, plan: null });
  });

  it("is only for the Household's owner", async () => {
    const { api, token } = await setup();
    await api.put(`/api/households/${SIN}/usage-plan`, { cut: 5, missionIds: ["ref-medium"] }, token);
    const tokenB = await api.login(testLogins[1]!.email);
    expect((await api.get(`/api/households/${SIN}/usage-plan`, tokenB)).status).toBe(404);
    expect((await api.put(`/api/households/${FOREIGN_SIN}/usage-plan`, { cut: 5, missionIds: ["ref-medium"] }, token)).status).toBe(404);
  });
});
