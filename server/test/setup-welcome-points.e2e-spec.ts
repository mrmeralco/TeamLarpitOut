import { describe, expect, it } from "vitest";
import type { Bill } from "../src/domain/bill.js";
import { bill, harness, schedule } from "./utils/test-harness.js";

const SIN = "1234567890";
const schedules = [schedule("2026-09", 10), schedule("2026-10", 11), schedule("2026-11", 11)];
const weather = { "2026-09": 10, "2026-10": 10, "2026-11": 10 };
const withAircon = { appliances: [
  { type: "aircon", answers: { mount: "split", inverter: "yes", room: "medium" }, timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }] },
  { type: "refrigerator" },
] };
const noAircon = { appliances: [{ type: "refrigerator" }, { type: "electric_fan", answers: { kind: "stand" }, timeRanges: [{ start: "13:00", end: "17:00", days: "everyday" }] }] };
const setupPath = `/api/households/${SIN}/setup`;

/** Flat weather and usage: no Verified Savings until the test adds a lower Bill. */
async function setup(bills: Bill[] = [bill("2026-09", 240, 30), bill("2026-10", 240, 30)]) {
  const api = await harness({ billSource: { bills: async (sin) => (sin === SIN ? bills : []) }, weather, schedules });
  return { api, token: await api.login(), bills };
}

describe("Household Setup checklist", () => {
  it("is a per-Household checklist of household info, appliances and a typical day", async () => {
    const { api, token } = await setup();
    const first = await api.get(setupPath, token);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ doneCount: 0, total: 3, complete: false, welcomePoints: { points: 50, granted: false, locked: false } });
    expect(first.body.steps.map((s: { key: string }) => s.key)).toEqual(["household", "appliances", "routine"]);

    expect((await api.put(`${setupPath}/household`, { size: 4 }, token)).body.doneCount).toBe(1);
    await api.put(`/api/households/${SIN}/appliances`, withAircon, token);
    expect((await api.get(setupPath, token)).body.doneCount).toBe(2);
    expect((await api.get(`/api/households/9876543210/setup`, token)).body.doneCount).toBe(0);
  });

  it("asks only household size, home hours and appliances", async () => {
    const { api, token } = await setup();
    for (const body of [{ size: 0 }, { size: 21 }, { size: 2.5 }, {}]) {
      expect((await api.put(`${setupPath}/household`, body, token)).status).toBe(400);
    }
    const saved = await api.put(`${setupPath}/household`, { size: 3, name: "Rosa", phone: "0917", birthday: "1990-01-01" }, token);
    expect(saved.body.household).toEqual({ size: 3 });
    expect(JSON.stringify(saved.body)).not.toMatch(/Rosa|0917|1990/);
    expect((await api.put(`${setupPath}/routine`, { home: "sometimes" }, token)).status).toBe(400);
  });

  it("requires the aircon routine only when the home has an aircon", async () => {
    const { api, token } = await setup();
    await api.put(`/api/households/${SIN}/appliances`, withAircon, token);
    expect((await api.put(`${setupPath}/routine`, { home: "allDay" }, token)).status).toBe(400);
    const other = await setup();
    await other.api.put(`/api/households/${SIN}/appliances`, noAircon, other.token);
    await other.api.put(`${setupPath}/household`, { size: 2 }, other.token);
    const done = await other.api.put(`${setupPath}/routine`, { home: "daytime" }, other.token);
    expect(done.body).toMatchObject({ complete: true, hasAircon: false, routine: { home: "daytime", aircon: null } });
  });

  it("finishing grants 50 Welcome Points once per Household, even from a second login", async () => {
    const { api, token } = await setup();
    await api.put(`/api/households/${SIN}/appliances`, withAircon, token);
    await api.put(`${setupPath}/household`, { size: 4 }, token);
    const done = await api.put(`${setupPath}/routine`, { home: "eveningsWeekends", aircon: "sleeping" }, token);
    expect(done.body).toMatchObject({ complete: true, doneCount: 3, welcomePoints: { granted: true, locked: true } });
    // Finishing again, and from another login on the same Household (after re-linking it), grants nothing more.
    await api.put(`${setupPath}/routine`, { home: "allDay", aircon: "mostOfDay" }, token);
    await api.put(`${setupPath}/household`, { size: 5 }, token);
    await api.links.save({ ownerId: "second-login", sin: SIN, can: "1000000001", status: "active" });
    const points = await api.get(`/api/households/${SIN}/points`, token);
    expect(points.body.history.filter((e: { source: string }) => e.source === "welcome")).toHaveLength(1);
    expect(points.body).toMatchObject({ balance: 50, lockedPoints: 50, spendable: 0 });
  });

  it("Missions cannot be picked until setup is complete", async () => {
    const { api, token } = await setup();
    await api.put(`/api/households/${SIN}/appliances`, withAircon, token);
    const missions = await api.get(`/api/households/${SIN}/missions`, token);
    const locked = await api.put(`/api/households/${SIN}/usage-plan`, { cut: 5, missionIds: [missions.body.missions[0].id] }, token);
    expect(locked.status).toBe(409);
    expect(locked.body).toMatchObject({ reason: "setupIncomplete", error: "Finish setup to unlock Missions." });
    await api.completeSetup(SIN, token);
    expect((await api.put(`/api/households/${SIN}/usage-plan`, { cut: 5, missionIds: [missions.body.missions[0].id] }, token)).status).toBe(200);
  });
});

describe("Eelio's Missions onboarding", () => {
  it("is marked seen on the server, once per Household", async () => {
    const { api, token } = await setup();
    expect((await api.get(`/api/households/${SIN}/setup`, token)).body.onboardingSeen).toBe(false);
    const res = await api.post(`/api/households/${SIN}/setup/onboarding-seen`, {}, token);
    expect(res.status).toBe(200);
    expect(res.body.onboardingSeen).toBe(true);
    expect((await api.get(`/api/households/${SIN}/setup`, token)).body.onboardingSeen).toBe(true);
  });
});

describe("locked Welcome Points", () => {
  it("show in the balance, locked until the first savings on a bill, then spendable", async () => {
    const { api, token, bills } = await setup();
    await api.put(`/api/households/${SIN}/appliances`, withAircon, token);
    await api.completeSetup(SIN, token);
    const before = await api.get(`/api/households/${SIN}/rewards`, token);
    expect(before.body).toMatchObject({ balance: 50, lockedPoints: 50, spendable: 0 });

    // The next Bill shows savings: 240 → 200 kWh (₱440 off a ₱2,690 Baseline). The 1% noise band
    // isn't counted, savings past the 5% goal count half up to twice the goal, 1 pt per ₱2, and
    // November 2026 is a very strong El Niño month (×1.3): 131 points; with Welcome Points 181.
    bills.push(bill("2026-11", 200, 30));
    const after = await api.get(`/api/households/${SIN}/rewards`, token);
    expect(after.body).toMatchObject({ balance: 181, lockedPoints: 0, spendable: 181 });
    expect(after.body.catalog.find((i: { id: string }) => i.id === "reward-load-50")).toMatchObject({ pointsCost: 250, affordable: false, pointsNeeded: 69 });
  });

  it("refuses a redemption that would spend locked Welcome Points", async () => {
    const { api, token } = await setup();
    await api.put(`/api/households/${SIN}/appliances`, withAircon, token);
    await api.completeSetup(SIN, token);
    const res = await api.post(`/api/households/${SIN}/rewards/redeem`, { rewardId: "reward-load-50" }, token);
    expect(res.status).toBe(400);
    expect((await api.get(`/api/households/${SIN}/points`, token)).body.balance).toBe(50);
  });
});
