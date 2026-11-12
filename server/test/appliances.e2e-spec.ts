import { describe, expect, it } from "vitest";
import { bill, harness, testLogins } from "./utils/test-harness.js";

const SIN = "1234567890"; // owner-a, traditional
const OTHER_OWN_SIN = "9876543210"; // owner-a, smart
const FOREIGN_SIN = "5555555555"; // owner-b

// Latest Bill: October at ₱11/kWh (₱6.60 generation + ₱4.40 distribution), ₱50 fixed.
const bills = { [SIN]: [bill("2026-09", 210, 30), bill("2026-10", 237.4, 31)] };

const survey = {
  appliances: [
    {
      type: "aircon",
      answers: { mount: "split", inverter: "yes", room: "medium" },
      timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }],
    },
    { type: "refrigerator", answers: { inverter: "unknown", size: "unknown" } },
    { type: "wifi" },
    {
      type: "electric_fan",
      quantity: 2,
      answers: { kind: "stand" },
      timeRanges: [{ start: "13:00", end: "17:00", days: "weekends" }],
    },
    { type: "washing_machine", answers: { kind: "automatic" }, usesPerWeek: 2 },
  ],
};

async function savedHousehold() {
  const api = await harness({ bills });
  const token = await api.login();
  const saved = await api.put(`/api/households/${SIN}/appliances`, survey, token);
  return { api, token, saved };
}

const byType = (list: any[], type: string) => list.find((a) => a.type === type);

const airconLabel = { consumptionKwh: 270, period: "monthly", referenceDays: 30, referenceHoursPerDay: 9, confirmed: true };
const refLabel = { consumptionKwh: 30, period: "monthly", referenceDays: 30, confirmed: true };

describe("Confirmed appliance energy labels", () => {
  it("prefers the label to conflicting answers and normalizes one appliance before multiplying quantity", async () => {
    const { api, token } = await savedHousehold();
    const saved = await api.put(`/api/households/${SIN}/appliances`, { appliances: [
      { ...survey.appliances[0], quantity: 2, energyLabel: { ...airconLabel, kwhPerHour: 999 } },
      { type: "refrigerator", quantity: 3, answers: { inverter: "yes", size: "large" }, energyLabel: refLabel },
    ] }, token);
    expect(saved.status).toBe(200);
    expect(saved.body.appliances[0]).toMatchObject({
      energyLabel: { ...airconLabel, kwhPerHour: 1 }, source: "label", sourceLabel: "Mula sa energy label",
      hoursPerDay: 8, estimatedKwhPerDay: 16,
    });
    expect(saved.body.appliances[1]).toMatchObject({
      energyLabel: refLabel, source: "label", sourceLabel: "Mula sa energy label", estimatedKwhPerDay: 3,
    });
    expect(saved.body.appliances[1].energyLabel.kwhPerHour).toBeCloseTo(1 / 24, 12);

    const rows = (await api.get(`/api/households/${SIN}/appliances/breakdown`, token)).body;
    expect(byType(rows.rows, "aircon")).toMatchObject({ source: "label", estimatedKwh: 16 * 31 });
    expect(byType(rows.rows, "refrigerator")).toMatchObject({ source: "label", estimatedKwh: 3 * 31 });
    expect(rows.rows.reduce((s: number, r: any) => s + Math.round(r.kwh * 100), 0)).toBe(23_740);
    expect(rows.rows.reduce((s: number, r: any) => s + r.pesos, 0)).toBe(261_140);
    expect(rows.totals).toEqual({ kwh: 237.4, perKwhCharges: 261_140, fixedCharges: 5_000 });
  });

  it("uses the confirmed reference hours rather than assuming a 9-hour day", async () => {
    const { api, token } = await savedHousehold();
    const { status, body } = await api.put(`/api/households/${SIN}/appliances`, { appliances: [
      { ...survey.appliances[0], energyLabel: { ...airconLabel, referenceHoursPerDay: 6 } },
      { type: "refrigerator", energyLabel: { consumptionKwh: 1.2, period: "daily", confirmed: true } },
      { ...survey.appliances[0], energyLabel: { consumptionKwh: 9, period: "daily", referenceHoursPerDay: 9, confirmed: true } },
    ] }, token);
    expect(status).toBe(200);
    expect(body.appliances[0]).toMatchObject({ energyLabel: { kwhPerHour: 1.5 }, estimatedKwhPerDay: 12 });
    expect(body.appliances[1].estimatedKwhPerDay).toBe(1.2);
    expect(body.appliances[2]).toMatchObject({ energyLabel: { kwhPerHour: 1 }, estimatedKwhPerDay: 8 });
  });

  it("round-trips per household, survives editing, and falls back to answers/default when omitted", async () => {
    const { api, token } = await savedHousehold();
    await api.put(`/api/households/${SIN}/appliances`, { appliances: [
      { ...survey.appliances[0], energyLabel: airconLabel },
      { type: "refrigerator", energyLabel: refLabel },
    ] }, token);
    const read = await api.get(`/api/households/${SIN}/appliances`, token);
    expect(read.body.appliances[0].energyLabel).toEqual({ ...airconLabel, kwhPerHour: 1 });
    expect(read.body.appliances[1].energyLabel).toMatchObject(refLabel);
    expect((await api.get(`/api/households/${OTHER_OWN_SIN}/appliances`, token)).body.saved).toBe(false);
    const edited = read.body.appliances.map((a: any) => ({ ...a, quantity: 2 }));
    const saved = await api.put(`/api/households/${SIN}/appliances`, { appliances: edited }, token);
    expect(saved.status).toBe(200);
    expect(saved.body.appliances[0]).toMatchObject({ energyLabel: airconLabel, estimatedKwhPerDay: 16 });
    const removed = edited.map(({ energyLabel: _label, ...a }: any) => a);
    const fallback = await api.put(`/api/households/${SIN}/appliances`, { appliances: removed }, token);
    expect(fallback.status).toBe(200);
    expect(fallback.body.appliances[0]).toMatchObject({ source: "answers", sourceLabel: "Tantya mula sa sagot mo", estimatedKwhPerDay: 12.32 });
    expect(fallback.body.appliances[1]).toMatchObject({ source: "default", sourceLabel: "Hula (default)", estimatedKwhPerDay: 2.2 });
    expect(fallback.body.appliances.every((a: any) => a.energyLabel === undefined)).toBe(true);
  });

  it.each([
    ["unconfirmed", { ...airconLabel, confirmed: false }],
    ["missing confirmation", { ...airconLabel, confirmed: undefined }],
    ["string confirmation", { ...airconLabel, confirmed: "true" }],
    ["incomplete", {}],
    ["null", null],
    ["array", []],
    ["string", "270 kWh"],
    ["missing consumption", { ...airconLabel, consumptionKwh: undefined }],
    ["zero consumption", { ...airconLabel, consumptionKwh: 0 }],
    ["negative consumption", { ...airconLabel, consumptionKwh: -1 }],
    ["string consumption", { ...airconLabel, consumptionKwh: "270" }],
    ["non-finite consumption", { ...airconLabel, consumptionKwh: Infinity }],
    ["wrong units", { ...airconLabel, period: "watts" }],
    ["missing period", { ...airconLabel, period: undefined }],
    ["missing days", { ...airconLabel, referenceDays: undefined }],
    ["zero days", { ...airconLabel, referenceDays: 0 }],
    ["negative days", { ...airconLabel, referenceDays: -30 }],
    ["null days", { ...airconLabel, referenceDays: null }],
    ["missing hours", { ...airconLabel, referenceHoursPerDay: undefined }],
    ["zero hours", { ...airconLabel, referenceHoursPerDay: 0 }],
    ["negative hours", { ...airconLabel, referenceHoursPerDay: -9 }],
    ["hours over a day", { ...airconLabel, referenceHoursPerDay: 25 }],
    ["null hours", { ...airconLabel, referenceHoursPerDay: null }],
    ["conflicting daily basis", { ...airconLabel, period: "daily" }],
    ["overflow", { ...airconLabel, referenceDays: Number.MIN_VALUE }],
    ["underflow", { ...airconLabel, consumptionKwh: Number.MIN_VALUE }],
  ])("rejects %s label input without replacing any stored appliances", async (_name, energyLabel) => {
    const { api, token, saved } = await savedHousehold();
    const result = await api.put(`/api/households/${SIN}/appliances`, { appliances: [
      { type: "wifi", quantity: 4 }, { ...survey.appliances[0], energyLabel },
    ] }, token);
    expect(result.status).toBe(400);
    expect((await api.get(`/api/households/${SIN}/appliances`, token)).body).toEqual(saved.body);
  });

  it("rejects unsupported appliance types and a refrigerator basis shorter than 24 hours", async () => {
    const { api, token, saved } = await savedHousehold();
    for (const appliance of [
      { type: "wifi", energyLabel: refLabel },
      { type: "refrigerator", energyLabel: { ...refLabel, referenceHoursPerDay: 9 } },
    ]) {
      expect((await api.put(`/api/households/${SIN}/appliances`, { appliances: [appliance] }, token)).status).toBe(400);
    }
    expect((await api.get(`/api/households/${SIN}/appliances`, token)).body).toEqual(saved.body);
  });
});

describe("GET /api/appliances/catalog", () => {
  it("lists the visual questions, each with a 'Hindi ko alam' option", async () => {
    const api = await harness();
    const { status, body } = await api.get("/api/appliances/catalog");
    expect(status).toBe(200);
    const aircon = byType(body.appliances, "aircon");
    expect(aircon.routine).toBe("timeRanges");
    expect(aircon.questions.map((q: any) => q.key)).toEqual(["mount", "inverter", "room"]);
    expect(aircon.questions[0].options.at(-1)).toEqual({ value: "unknown", label: "Hindi ko alam" });
    expect(byType(body.appliances, "refrigerator").routine).toBe("alwaysOn");
    expect(byType(body.appliances, "washing_machine").routine).toBe("usesPerWeek");
  });
});

describe("Household appliances", () => {
  it("are saved once per Household and returned without re-asking", async () => {
    const { api, token, saved } = await savedHousehold();
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toBe(true);

    const again = await api.get(`/api/households/${SIN}/appliances`, token);
    expect(again.body.saved).toBe(true);
    expect(again.body.appliances.map((a: any) => a.type)).toEqual([
      "aircon",
      "refrigerator",
      "wifi",
      "electric_fan",
      "washing_machine",
    ]);
    expect(again.body.updatedAt).toEqual(saved.body.updatedAt);

    // Another Household of the same owner has its own (empty) list.
    const other = await api.get(`/api/households/${OTHER_OWN_SIN}/appliances`, token);
    expect(other.body).toEqual({ saved: false, updatedAt: null, appliances: [] });
  });

  it("tags each appliance with where its figure came from", async () => {
    const { saved } = await savedHousehold();
    const list = saved.body.appliances;
    expect(byType(list, "aircon")).toMatchObject({ source: "answers", sourceLabel: "Tantya mula sa sagot mo" });
    expect(byType(list, "refrigerator")).toMatchObject({ source: "default", sourceLabel: "Hula (default)" });
    expect(byType(list, "wifi")).toMatchObject({ source: "default", sourceLabel: "Hula (default)" });
    expect(byType(list, "washing_machine").source).toBe("answers");
  });

  it("turns routines into hours, not the other way round", async () => {
    const { saved } = await savedHousehold();
    const list = saved.body.appliances;
    // 22:00 → 06:00 every day crosses midnight: 8 h/day at 0.77 kW (split, inverter, medium room).
    expect(byType(list, "aircon")).toMatchObject({ hoursPerDay: 8, estimatedKwhPerDay: 6.16 });
    // Two stand fans, 4 h on weekends only: 4 × 2/7 h/day each.
    expect(byType(list, "electric_fan")).toMatchObject({ hoursPerDay: 1.14, estimatedKwhPerDay: 0.137 });
    // Always-on and per-use appliances have no hours.
    expect(byType(list, "refrigerator")).toMatchObject({ hoursPerDay: null, estimatedKwhPerDay: 1.1 });
    expect(byType(list, "washing_machine")).toMatchObject({ hoursPerDay: null, estimatedKwhPerDay: 0.171 });
  });

  it("replaces the list on edit", async () => {
    const { api, token } = await savedHousehold();
    await api.put(`/api/households/${SIN}/appliances`, { appliances: [{ type: "wifi" }] }, token);
    const { body } = await api.get(`/api/households/${SIN}/appliances`, token);
    expect(body.appliances.map((a: any) => a.type)).toEqual(["wifi"]);
  });

  it("are only for the Household's owner", async () => {
    const api = await harness({ bills });
    const token = await api.login();
    expect((await api.get(`/api/households/${SIN}/appliances`)).status).toBe(401);
    expect((await api.put(`/api/households/${FOREIGN_SIN}/appliances`, survey, token)).status).toBe(404);
    expect((await api.get(`/api/households/${FOREIGN_SIN}/appliances/breakdown`, token)).status).toBe(404);

    // owner-b cannot read owner-a's list either.
    await api.put(`/api/households/${SIN}/appliances`, survey, token);
    const tokenB = await api.login(testLogins[1]!.email, testLogins[1]!.password);
    expect((await api.get(`/api/households/${SIN}/appliances`, tokenB)).status).toBe(404);
  });

  it("rejects answers and routines the catalog doesn't allow", async () => {
    const api = await harness({ bills });
    const token = await api.login();
    const put = (appliances: unknown[]) => api.put(`/api/households/${SIN}/appliances`, { appliances }, token);

    const unknownType = await put([{ type: "spaceship" }]);
    expect(unknownType.status).toBe(400);
    expect(unknownType.body.issues).toEqual(["Hindi kilalang appliance: spaceship"]);

    expect((await put([{ type: "aircon", answers: { room: "small" } }])).body.issues).toEqual([
      "Aircon: kailan ito bukas?",
    ]);
    expect(
      (await put([{ type: "tv", answers: { size: "huge" }, timeRanges: [{ start: "19:00", end: "22:00", days: "everyday" }] }])).body
        .issues,
    ).toEqual(['TV: hindi tanggap ang sagot na "huge" sa "size"']);
    expect((await put([{ type: "washing_machine" }])).body.issues).toEqual(["Washing machine: ilang beses kada linggo (0–50)?"]);
    expect(
      (await put([{ type: "lights", timeRanges: [{ start: "25:00", end: "06:00", days: "everyday" }] }])).body.issues,
    ).toEqual(["Mga ilaw: oras dapat HH:MM"]);

    // Nothing invalid was saved.
    expect((await api.get(`/api/households/${SIN}/appliances`, token)).body.saved).toBe(false);
  });
});

describe('GET /api/households/:sin/appliances/breakdown ("Saan napupunta?")', () => {
  it("calibrates appliance kWh so the total equals the Bill's kWh exactly", async () => {
    const { api, token } = await savedHousehold();
    const { status, body } = await api.get(`/api/households/${SIN}/appliances/breakdown`, token);

    expect(status).toBe(200);
    expect(body.bill).toEqual({ period: "2026-10", kwh: 237.4, billingDays: 31 });
    const hundredths = body.rows.reduce((s: number, r: any) => s + Math.round(r.kwh * 100), 0);
    expect(hundredths).toBe(23_740);
    expect(body.totals.kwh).toBe(237.4);
  });

  it("splits the per-kWh charges the same way and keeps Fixed Charges apart", async () => {
    const { api, token } = await savedHousehold();
    const { body } = await api.get(`/api/households/${SIN}/appliances/breakdown`, token);
    // 237.4 kWh × ₱6.60 + 237.4 kWh × ₱4.40, each line rounded to the centavo.
    expect(body.totals.perKwhCharges).toBe(156_684 + 104_456);
    expect(body.rows.reduce((s: number, r: any) => s + r.pesos, 0)).toBe(body.totals.perKwhCharges);
    expect(body.totals.fixedCharges).toBe(5_000);
  });

  it("orders appliances by kWh, each with its source tag, and keeps the estimates' proportions", async () => {
    const { api, token } = await savedHousehold();
    const { body } = await api.get(`/api/households/${SIN}/appliances/breakdown`, token);
    expect(body.rows[0]).toMatchObject({ type: "aircon", label: "Aircon", sourceLabel: "Tantya mula sa sagot mo" });
    expect(body.rows.map((r: any) => r.kwh)).toEqual([...body.rows.map((r: any) => r.kwh)].sort((a, b) => b - a));
    const aircon = body.rows[0];
    const ref = byType(body.rows, "refrigerator");
    expect(aircon.kwh / ref.kwh).toBeCloseTo(6.16 / 1.1, 1);
    expect(body.rows.reduce((s: number, r: any) => s + r.share, 0)).toBeCloseTo(1, 10);
  });

  it("asks for the survey first, and needs a Bill", async () => {
    const api = await harness({ bills });
    const token = await api.login();
    expect((await api.get(`/api/households/${SIN}/appliances/breakdown`, token)).status).toBe(409);

    await api.put(`/api/households/${OTHER_OWN_SIN}/appliances`, survey, token);
    expect((await api.get(`/api/households/${OTHER_OWN_SIN}/appliances/breakdown`, token)).status).toBe(404);
  });
});
