import { describe, expect, it } from "vitest";
import type { Bill } from "../src/domain/bill.js";
import { bill, harness, schedule } from "./utils/test-harness.js";

const SIN = "1234567890"; // owner-a
const FOREIGN_SIN = "5555555555"; // owner-b

// 2026-10: 240 kWh over 30 days = 8.0 kWh/day.
// At 10 CDD/day with 1.0 kWh/CDD heat sensitivity:
const baseHistory = (): Bill[] => [bill("2026-09", 210, 30), bill("2026-10", 240, 30)];

const survey = {
  appliances: [
    {
      type: "aircon",
      answers: { mount: "split", inverter: "yes", room: "medium" },
      timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }], // 8 h/day -> heat sensitivity ~1.0
    },
    { type: "refrigerator" },
  ],
};

const schedules = [
  schedule("2026-09", 10),
  schedule("2026-10", 11),
  schedule("2026-11", 11),
];

describe("Verified Savings and Points (traditional)", () => {
  it("cooler-weather month with unchanged habits earns ~0 Points", async () => {
    // October has 10 CDD/day.
    // November is 2 CDD/day cooler (8 CDD/day).
    // With heat sensitivity ~1.0 kWh/CDD, cooling use drops naturally by 1.0 * (8 - 10) = -2 kWh/day.
    // Unchanged habit: household uses (8 - 2) * 30 = 180 kWh in November.
    const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 8 };
    const bills = { [SIN]: [...baseHistory(), bill("2026-11", 180, 30)] };

    const api = await harness({ bills, weather, schedules });
    const token = await api.login();
    await api.put(`/api/households/${SIN}/appliances`, survey, token);

    const { status, body } = await api.get(`/api/households/${SIN}/points`, token);

    expect(status).toBe(200);
    expect(body.balance).toBe(0);
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      period: "2026-11",
      actualKwh: 180,
      baselineKwh: 180,
      points: 0,
      savedPesos: 0,
    });
  });

  it("outage period excluded", async () => {
    // Weather is unchanged (10 CDD -> 10 CDD).
    // Actual bill is 200 kWh (40 kWh lower than baseline 240 kWh).
    // BUT Meralco records an outage / brownout in November 2026.
    const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 10 };
    const bills = { [SIN]: [...baseHistory(), bill("2026-11", 200, 30)] };
    const outages = [{ sin: SIN, period: "2026-11", description: "Scheduled grid maintenance" }];

    const api = await harness({ bills, weather, schedules, outages });
    const token = await api.login();
    await api.put(`/api/households/${SIN}/appliances`, survey, token);

    const { status, body } = await api.get(`/api/households/${SIN}/points`, token);

    expect(status).toBe(200);
    // Period with recorded brownout does not count for points
    expect(body.balance).toBe(0);
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      period: "2026-11",
      points: 0,
      hasOutage: true,
      excludedReason: expect.stringContaining("outage"),
    });
  });

  it("self-report earns nothing", async () => {
    const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 10 };
    const bills = { [SIN]: baseHistory() };

    const api = await harness({ bills, weather, schedules });
    const token = await api.login();
    await api.put(`/api/households/${SIN}/appliances`, survey, token);
    await api.completeSetup(SIN, token);

    // Save a plan first
    const putRes = await api.put(
      `/api/households/${SIN}/usage-plan`,
      { cut: 5, missionIds: ["aircon-timer-2h"] },
      token,
    );
    expect(putRes.status).toBe(200);

    // Household self-reports "done" on a mission
    const res = await api.post(
      `/api/households/${SIN}/usage-plan/self-report`,
      { missionId: "aircon-timer-2h", status: "done" },
      token,
    );

    expect(res.status).toBe(201);
    expect(res.body.awardedPoints).toBe(0);
    // Only the (locked) Welcome Points from finishing setup; the self-report added nothing.
    expect(res.body.balance).toBe(50);
    expect(res.body.message).toContain("not from self-reports");

    // Balance is still only the locked Welcome Points: nothing spendable
    const pointsRes = await api.get(`/api/households/${SIN}/points`, token);
    expect(pointsRes.body).toMatchObject({ balance: 50, lockedPoints: 50, spendable: 0 });
  });

  it("awards Points for savings past the normal range, capped by the goal and set by the month's climate", async () => {
    // Weather is unchanged: 10 CDD -> 10 CDD. Usage dropped from 240 kWh to 210 kWh (30 kWh saved).
    // Baseline: 240 kWh at ₱11/kWh + ₱50 fixed = ₱2,690. Actual: 210 kWh = ₱2,360. Saved: ₱330.
    // Noise band (1% of the Baseline): ₱26.90 not counted, so ₱303.10 counts.
    // 5% goal = ₱134.50 counts in full; the next ₱134.50 (up to twice the goal) counts half.
    // ₱134.50 + ₱67.25 = ₱201.75 → 1 pt per ₱2 = 100.9 → November 2026, very strong El Niño ×1.3 → 131.
    const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 10 };
    const bills = { [SIN]: [...baseHistory(), bill("2026-11", 210, 30)] };

    const api = await harness({ bills, weather, schedules });
    const token = await api.login();
    await api.put(`/api/households/${SIN}/appliances`, survey, token);

    const { status, body } = await api.get(`/api/households/${SIN}/points`, token);

    expect(status).toBe(200);
    expect(body.balance).toBe(131);
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      period: "2026-11",
      baselineKwh: 240,
      actualKwh: 210,
      savedKwh: 30,
      savedPesos: 33_000,
      points: 131,
      hasOutage: false,
      source: "bill_verified",
    });
    expect(body.history[0].description).toContain("30 kWh saved");
    expect(body.history[0].description).toContain("Very strong El Niño ×1.3");
  });

  it("needs login and household ownership", async () => {
    const api = await harness({ bills: { [SIN]: baseHistory() } });
    const token = await api.login();

    // No token
    expect((await api.get(`/api/households/${SIN}/points`)).status).toBe(401);
    // Other owner's household
    expect((await api.get(`/api/households/${FOREIGN_SIN}/points`, token)).status).toBe(404);
  });
});
