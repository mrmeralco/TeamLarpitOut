import { describe, expect, it } from "vitest";
import { datesBetween, manilaDate } from "../src/domain/daily-points.js";
import type { HourlyReading } from "../src/domain/meter-reading.js";
import type { DailyTemperature } from "../src/weather/daily-weather-source.interface.js";
import { MockReadingSource } from "../src/smart-meter/mock-reading-source.provider.js";
import { bill, harness, schedule, type HarnessOptions } from "./utils/test-harness.js";

const SMART = "9876543210"; // owner-a's smart meter Household
const HOUR = 3_600_000;
const at = (date: string, hour = 0) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00+08:00`);

/** 26–30 °C, i.e. 4–8 cooling degree days, cycling by day of month. */
const temperatureOn = (date: string) => 26 + (Number(date.slice(8, 10)) % 5);

/**
 * 300 Wh every hour, plus the aircon from 10 PM to 6 AM at 1,000 Wh + 100 Wh per CDD:
 * a day uses 15.2 + 0.8 × CDD kWh. From `followsFrom` on, the aircon goes off at 5 AM,
 * saving 1 + 0.1 × CDD kWh a day.
 */
function smartReadings(from: string, to: string, followsFrom = Infinity): HourlyReading[] {
  const rows: HourlyReading[] = [];
  for (let t = at(from); t < at(to); t += HOUR) {
    const date = manilaDate(t);
    const hour = new Date(t + 8 * HOUR).getUTCHours();
    const cdd = temperatureOn(date) - 22;
    const aircon = hour >= 22 || hour < (t >= followsFrom ? 5 : 6) ? 1000 + 100 * cdd : 0;
    rows.push({ from: new Date(t).toISOString(), wh: 300 + aircon });
  }
  return rows;
}

const heat = (from: string, to: string): DailyTemperature[] =>
  datesBetween(from, to).map((date) => ({ date, temperatureC: temperatureOn(date) }));

const survey = {
  appliances: [
    { type: "aircon", answers: { mount: "split", inverter: "yes", room: "medium" }, timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }] },
    { type: "refrigerator" },
  ],
};
// Per-kWh charges sum to ₱11/kWh on the latest Bill's Rate Schedule.
const schedules = [schedule("2026-09", 10), schedule("2026-10", 11), schedule("2026-11", 11)];
const bills = { [SMART]: [bill("2026-09", 210, 30), bill("2026-10", 240, 30)] };

const PLAN_STARTS = at("2026-11-10", 9);

/** A smart meter Household that finished setup and started Missions on Nov 10, 9 AM. */
async function startedMissions(opts: Partial<HarnessOptions> & { followsFrom?: number } = {}) {
  const clock = { now: PLAN_STARTS };
  const api = await harness({
    bills,
    schedules,
    readings: { [SMART]: smartReadings("2026-10-01", "2026-11-20", opts.followsFrom ?? PLAN_STARTS) },
    dailyWeather: { [SMART]: heat("2026-10-01", "2026-11-20") },
    now: () => clock.now,
    ...opts,
  });
  const token = await api.login();
  expect((await api.put(`/api/households/${SMART}/appliances`, survey, token)).status).toBe(200);
  await api.completeSetup(SMART, token);
  expect((await api.put(`/api/households/${SMART}/usage-plan`, { cut: 5, missionIds: ["aircon-timer-2h"] }, token)).status).toBe(200);
  const points = async () => (await api.get(`/api/households/${SMART}/points`, token)).body;
  const days = async () => (await points()).history.filter((e: { source: string }) => e.source === "meter_verified");
  return { api, token, clock, points, days };
}

describe("Daily Points for smart meter Households (ADR-0008)", () => {
  it("earns Points for every complete day after Missions started, priced at the Bill's per-kWh rate", async () => {
    const { clock, points, days } = await startedMissions();

    // The day Missions started is part plan, part not; it never counts. Nothing is settled yet.
    clock.now = at("2026-11-10", 23);
    expect(await points()).toMatchObject({ balance: 50, lockedPoints: 50, spendable: 0 });

    // Nov 14, 9 AM: Nov 11–13 are complete; Nov 14 is still running.
    clock.now = at("2026-11-14", 9);
    const settled = await days();
    expect(settled.map((e: { day: string }) => e.day)).toEqual(["2026-11-13", "2026-11-12", "2026-11-11"]);
    // Nov 11 is 27 °C (5 CDD): expected 15.2 + 0.8 × 5 = 19.2 kWh, used 17.7, saved 1.5 kWh × ₱11 = ₱16.50.
    // Points (same rules as the Bill): ₱211.20 baseline → ₱2.11 noise band not counted; ₱10.56 goal in full
    // + ₱3.83 past it at half = ₱12.47 → 1 pt per ₱2 = 6.2 → November 2026, very strong El Niño ×1.3 → 8.
    expect(settled.at(-1)).toMatchObject({
      period: "2026-11",
      day: "2026-11-11",
      baselineKwh: 19.2,
      actualKwh: 17.7,
      savedKwh: 1.5,
      savedPesos: 1650,
      points: 8,
      hasOutage: false,
      source: "meter_verified",
    });
    expect(settled.at(-1).description).toBe("Verified Savings on November 11, 2026 (1.5 kWh saved)");
    // Nov 12 (6 CDD) saves 1.6 kWh = ₱17.60 → 8; Nov 13 (7 CDD) saves 1.7 kWh = ₱18.70 → 9.
    expect(settled.map((e: { points: number }) => e.points)).toEqual([9, 8, 8]);
    // The first daily savings unlock the Welcome Points.
    expect(await points()).toMatchObject({ balance: 75, lockedPoints: 0, spendable: 75 });
  });

  it("settles each day once and adds a new day as it completes", async () => {
    const { clock, points, days } = await startedMissions();
    clock.now = at("2026-11-14", 9);
    await points();
    expect(await days()).toHaveLength(3);
    clock.now = at("2026-11-15", 0);
    expect((await days()).map((e: { day: string }) => e.day)).toEqual(["2026-11-14", "2026-11-13", "2026-11-12", "2026-11-11"]);
    expect((await points()).balance).toBe(50 + 8 + 8 + 9 + 9);
  });

  it("gives a smart meter Household no Points from the Bill", async () => {
    const withNovemberBill = { [SMART]: [...bills[SMART]!, bill("2026-11", 150, 30)] };
    const { clock, points } = await startedMissions({ bills: withNovemberBill });
    clock.now = at("2026-11-14", 9);
    const body = await points();
    expect(body.history.some((e: { source: string }) => e.source === "bill_verified")).toBe(false);
    expect(body.balance).toBe(75);
  });

  it("earns nothing on a day with a recorded outage", async () => {
    const outages = [{ sin: SMART, period: "2026-11", date: "2026-11-12", description: "Feeder repair" }];
    const { clock, days } = await startedMissions({ outages });
    clock.now = at("2026-11-14", 9);
    const settled = await days();
    expect(settled.find((e: { day: string }) => e.day === "2026-11-12")).toMatchObject({
      points: 0,
      hasOutage: true,
      excludedReason: expect.stringContaining("outage"),
    });
    expect(settled.map((e: { points: number }) => e.points)).toEqual([9, 0, 8]);
  });

  it("waits on a day with missing readings instead of counting it as zero use", async () => {
    const readings = smartReadings("2026-10-01", "2026-11-20", PLAN_STARTS)
      .filter((r) => r.from !== new Date(at("2026-11-12", 3)).toISOString());
    const { clock, days } = await startedMissions({ readings: { [SMART]: readings } });
    clock.now = at("2026-11-14", 9);
    expect((await days()).map((e: { day: string }) => e.day)).toEqual(["2026-11-13", "2026-11-11"]);
  });

  it("earns about nothing when habits stay the same", async () => {
    const { clock, points, days } = await startedMissions({ followsFrom: Infinity });
    clock.now = at("2026-11-14", 9);
    const settled = await days();
    expect(settled).toHaveLength(3);
    expect(settled.every((e: { points: number; description: string }) => e.points === 0 && e.description.startsWith("No Verified Savings"))).toBe(true);
    expect(await points()).toMatchObject({ balance: 50, lockedPoints: 50 });
  });

  it("keeps counting from the first start when the plan is saved again", async () => {
    const { api, token, clock, days } = await startedMissions();
    clock.now = at("2026-11-14", 9);
    // Choosing the plan again must not move the start, or the saved days would become the reference.
    expect((await api.put(`/api/households/${SMART}/usage-plan`, { cut: 5, missionIds: ["aircon-timer-2h"] }, token)).status).toBe(200);
    expect((await api.get(`/api/households/${SMART}/usage-plan`, token)).body.plan.startedAt).toBe(new Date(PLAN_STARTS).toISOString());
    expect((await days()).map((e: { points: number }) => e.points)).toEqual([9, 8, 8]);
  });

  it("gives no daily Points before Missions start", async () => {
    const api = await harness({
      bills,
      schedules,
      readings: { [SMART]: smartReadings("2026-10-01", "2026-11-20") },
      dailyWeather: { [SMART]: heat("2026-10-01", "2026-11-20") },
      now: () => at("2026-11-14", 9),
    });
    const token = await api.login();
    const { body } = await api.get(`/api/households/${SMART}/points`, token);
    expect(body).toMatchObject({ balance: 0, history: [] });
  });

  it("gives a smart meter home today's Missions, a new set the next day, with yesterday's result and the streak", async () => {
    const { api, token, clock } = await startedMissions();
    clock.now = at("2026-11-14", 9);
    const plan = async () => (await api.get(`/api/households/${SMART}/missions/plan`, token)).body;
    const first = (await plan()).daily;
    expect(first.date).toBe("2026-11-14");
    expect(first.missions).toHaveLength(3);
    expect(new Set(first.missions.map((m: { id: string }) => m.id)).size).toBe(3);
    // Per-day figures: a fraction of the month's goal.
    expect(first.goal.pesos).toBeGreaterThan(0);
    for (const m of first.missions) {
      expect(m.pesoValue).toBeGreaterThan(0);
      // Said for today, not for the whole period.
      expect(m.why).toMatch(/Today this saves about [\d.]+ kWh/);
      expect(m.why).not.toMatch(/this period/);
    }
    // Yesterday (Nov 13) earned 9 points on the meter; Nov 11–13 all earned, so a 3-day streak.
    expect(first.yesterday).toMatchObject({ date: "2026-11-13", points: 9, hasOutage: false });
    expect(first.streak).toBe(3);
    clock.now = at("2026-11-15", 9);
    const next = (await plan()).daily;
    expect(next.date).toBe("2026-11-15");
    expect(next.missions.map((m: { id: string }) => m.id).sort()).not.toEqual(first.missions.map((m: { id: string }) => m.id).sort());
  });

  it("shows earned Points in the Rewards catalog", async () => {
    const { api, token, clock } = await startedMissions();
    clock.now = at("2026-11-14", 9);
    const { body } = await api.get(`/api/households/${SMART}/rewards`, token);
    expect(body.earned.slice(0, 3).map((e: { day: string }) => e.day)).toEqual(["2026-11-13", "2026-11-12", "2026-11-11"]);
    expect(body.spendable).toBe(75);
  });
});

describe("Mock smart meter after Missions start", () => {
  const range = { from: new Date(at("2026-11-11")).toISOString(), to: new Date(at("2026-11-12")).toISOString() };
  const wh = (rows: HourlyReading[], hour: number) => rows.find((r) => r.from === new Date(at("2026-11-11", hour)).toISOString())!.wh;
  const total = (rows: HourlyReading[]) => rows.reduce((s, r) => s + r.wh, 0);
  const STARTED = "2026-11-10T01:00:00.000Z";
  // A 30-day period, so a Mission's kWh per day is kwhSaved / 30.
  const plan = (missions: { id: string; kwhSaved: number }[], startedAt = STARTED) => ({
    period: "2026-11", createdAt: startedAt, startedAt,
    missions: missions.map((m) => ({ ...m, title: m.id, pesoValue: 0 })),
  });
  const read = (p?: ReturnType<typeof plan>) => new MockReadingSource(p ? { find: async () => p as never } : undefined).readings(SMART, range);

  it("lowers only the hours a Mission applies to, by its own kWh per day", async () => {
    const before = await read();
    // Aircon off 1 hour earlier: 15 kWh over 30 days = 500 Wh, all in the aircon's last hour (5 AM).
    const after = await read(plan([{ id: "aircon-off-1h", kwhSaved: 15 }]));
    expect(wh(before, 5) - wh(after, 5)).toBe(500);
    expect(wh(after, 4)).toBe(wh(before, 4));
    expect(wh(after, 20)).toBe(wh(before, 20));
    expect(total(before) - total(after)).toBe(500);
  });

  it("saves nothing on the aircon when the plan has no aircon Mission", async () => {
    const before = await read();
    // Ref at medium: 7.2 kWh over 30 days = 240 Wh a day, spread over 24 hours (10 Wh each).
    const after = await read(plan([{ id: "ref-medium", kwhSaved: 7.2 }]));
    for (const hour of [0, 5, 12, 20]) expect(wh(before, hour) - wh(after, hour)).toBe(10);
    expect(total(before) - total(after)).toBe(240);
  });

  it("saves what the whole plan promises, each Mission in its own hours", async () => {
    const before = await read();
    const after = await read(plan([
      { id: "aircon-timer-2h", kwhSaved: 30 }, // 1,000 Wh: 500 at 4 AM and 500 at 5 AM
      { id: "lights-off", kwhSaved: 3.6 }, // 120 Wh: 30 an hour, 6–10 PM
    ]));
    expect(wh(before, 4) - wh(after, 4)).toBe(500);
    expect(wh(before, 19) - wh(after, 19)).toBe(30);
    expect(wh(after, 12)).toBe(wh(before, 12));
    expect(total(before) - total(after)).toBe(1120);
  });

  it("leaves the days before Missions started as they were", async () => {
    const before = await read();
    const later = await read(plan([{ id: "aircon-off-1h", kwhSaved: 15 }], "2026-11-12T01:00:00.000Z"));
    expect(later).toEqual(before);
  });
});
