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

describe("13 · Aircon hours from Bill History (traditional)", () => {
  const cdds = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 3.5, 4.0, 4.5];
  const months = [
    "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
    "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
  ];
  const weatherMap: Record<string, number> = {};
  months.forEach((p, i) => { weatherMap[p] = cdds[i]!; });

  // Base 10 kWh/day, slope 2.0 kWh/CDD. Mean CDD = 4.0 -> cooling = 8.0 kWh/day.
  const syntheticBills = months.map((period, i) =>
    bill(period, Math.round((10 + 2.0 * cdds[i]!) * 30), 30),
  );

  it("API test with synthetic history and a known aircon returns the expected hours", async () => {
    const api = await harness({
      bills: { [SIN]: syntheticBills },
      weather: weatherMap,
    });
    const token = await api.login();

    // Default aircon (1.0 kW): 8.0 kWh cooling / 1.0 kW = 8 hours
    const res = await api.get(`/api/households/${SIN}/appliances/aircon-proposal`, token);
    expect(res.status).toBe(200);
    expect(res.body.canPropose).toBe(true);
    expect(res.body.hours).toBe(8);
    expect(res.body.coolingKwhPerDay).toBe(8);
    expect(res.body.airconKw).toBe(1.0);
    expect(res.body.prompt).toBe("Mukhang mga 8 oras/araw bukas ang aircon mo. Tama ba?");
    expect(res.body.options).toEqual([
      { action: "confirm", label: "Oo", hours: 8 },
      { action: "longer", label: "Mas matagal", hours: 10 },
      { action: "shorter", label: "Mas maikli", hours: 6 },
    ]);
  });

  it("calculates hours with specific aircon answers", async () => {
    const api = await harness({
      bills: { [SIN]: syntheticBills },
      weather: weatherMap,
    });
    const token = await api.login();

    // Window, non-inverter, large room: 1.6 * 1.1 * 1.0 = 1.76 kW
    // 8.0 kWh cooling / 1.76 kW = 4.545 -> rounded to 5 hours
    const res = await api.get(
      `/api/households/${SIN}/appliances/aircon-proposal?mount=window&inverter=no&room=large`,
      token,
    );
    expect(res.status).toBe(200);
    expect(res.body.canPropose).toBe(true);
    expect(res.body.hours).toBe(5);
    expect(res.body.prompt).toBe("Mukhang mga 5 oras/araw bukas ang aircon mo. Tama ba?");
  });

  it("proposal is never used until confirmed or adjusted", async () => {
    const api = await harness({
      bills: { [SIN]: syntheticBills },
      weather: weatherMap,
    });
    const token = await api.login();

    // 1. Fetching proposal does not save it.
    await api.get(`/api/households/${SIN}/appliances/aircon-proposal`, token);
    const initial = await api.get(`/api/households/${SIN}/appliances`, token);
    expect(initial.body.saved).toBe(false);
    expect(initial.body.appliances).toEqual([]);

    // 2. Saving an unconfirmed aircon without routine/timeRanges is rejected.
    const unconfirmedSave = await api.put(
      `/api/households/${SIN}/appliances`,
      { appliances: [{ type: "aircon" }] },
      token,
    );
    expect(unconfirmedSave.status).toBe(400);
    expect(unconfirmedSave.body.issues).toContain("Aircon: kailan ito bukas?");

    // 3. Only when user confirms (e.g. 8 hours) or adjusts is it accepted.
    const confirmedSave = await api.put(
      `/api/households/${SIN}/appliances`,
      {
        appliances: [
          {
            type: "aircon",
            timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }],
          },
        ],
      },
      token,
    );
    expect(confirmedSave.status).toBe(200);
    expect(confirmedSave.body.saved).toBe(true);
    expect(confirmedSave.body.appliances[0]).toMatchObject({
      type: "aircon",
      hoursPerDay: 8,
    });
  });

  it("falls back when household is smart meter or has insufficient bills", async () => {
    const api = await harness({
      bills: {
        [SIN]: syntheticBills.slice(0, 2), // only 2 bills
        [OTHER_OWN_SIN]: syntheticBills, // smart meter
      },
      weather: weatherMap,
    });
    const token = await api.login();

    // Traditional with fewer than 3 bills -> fallback
    const short = await api.get(`/api/households/${SIN}/appliances/aircon-proposal`, token);
    expect(short.body.canPropose).toBe(false);
    expect(short.body.fallback).toBe("routine");

    // Smart meter household -> fallback
    const smart = await api.get(`/api/households/${OTHER_OWN_SIN}/appliances/aircon-proposal`, token);
    expect(smart.body.canPropose).toBe(false);
    expect(smart.body.fallback).toBe("routine");
  });
});
