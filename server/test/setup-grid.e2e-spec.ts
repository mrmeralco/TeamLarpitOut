import { describe, expect, it } from "vitest";
import { bill, fakeVision, harness } from "./utils/test-harness.js";

const SIN = "1234567890";
const SMART = "9876543210";
const setup = `/api/households/${SIN}/setup`;
const cdds = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 3.5, 4.0, 4.5];
const months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const weather = Object.fromEntries(months.map((p, i) => [p, cdds[i]!]));
/** Base 10 kWh/day + 2 kWh per CDD: about 8 hours a day of a 1 kW aircon. */
const twelve = months.map((period, i) => bill(period, Math.round((10 + 2.0 * cdds[i]!) * 30), 30));

async function start(opts: Parameters<typeof harness>[0] = {}) {
  const api = await harness({ bills: { [SIN]: twelve }, weather, ...opts });
  const token = await api.login();
  await api.put(`${setup}/household`, { size: 4 }, token);
  return { api, token };
}

describe("Household Setup: tap grid and one routine", () => {
  it("saving the grid + routine stores counts and routine per Household and completes setup once", async () => {
    const { api, token } = await start();
    const grid = await api.put(`${setup}/appliances`, { counts: { aircon: 1, refrigerator: 1, electric_fan: 2, tv: 1 } }, token);
    expect(grid.status).toBe(200);
    expect(grid.body).toMatchObject({ grid: { aircon: 1, refrigerator: 1, electric_fan: 2, tv: 1 }, doneCount: 2, complete: false, hasAircon: true });
    const done = await api.put(`${setup}/routine`, { home: "allDay", aircon: "afternoonNight" }, token);
    expect(done.body).toMatchObject({ complete: true, routine: { home: "allDay", aircon: "afternoonNight" }, welcomePoints: { granted: true, locked: true } });

    const appliances = (await api.get(`/api/households/${SIN}/appliances`, token)).body.appliances;
    expect(appliances.map((a: { type: string; quantity: number }) => [a.type, a.quantity])).toEqual([["aircon", 1], ["refrigerator", 1], ["electric_fan", 2], ["tv", 1], ["lights", 1]]);
    expect(appliances.find((a: { type: string }) => a.type === "aircon").hoursPerDay).toBe(12);
    expect(appliances.find((a: { type: string }) => a.type === "tv").hoursPerDay).toBe(6);

    await api.put(`${setup}/routine`, { home: "daytime", aircon: "sleeping" }, token);
    await api.put(`${setup}/appliances`, { counts: { aircon: 1, refrigerator: 1 } }, token);
    const points = await api.get(`/api/households/${SIN}/points`, token);
    expect(points.body.history.filter((e: { source: string }) => e.source === "welcome")).toHaveLength(1);
    expect((await api.get(`/api/households/${SMART}/setup`, token)).body.grid).toBeNull();
    const breakdown = await api.get(`/api/households/${SIN}/appliances/breakdown`, token);
    expect(breakdown.body.totals.kwh).toBe(twelve.at(-1)!.kwh);
  });

  it("shows typical kWh per tile tagged 'Typical value', and no wattage or model fields", async () => {
    const { api, token } = await start();
    const { body } = await api.get(setup, token);
    expect(body.gridCatalog.map((t: { type: string }) => t.type)).toEqual([
      "aircon", "refrigerator", "electric_fan", "tv", "washing_machine", "rice_cooker", "flat_iron", "computer", "other",
    ]);
    expect(body.gridCatalog.every((t: { tag: string }) => t.tag === "Typical value")).toBe(true);
    expect(body.gridCatalog.find((t: { type: string }) => t.type === "aircon")).toMatchObject({ kwh: 1, unit: "kWh per hour" });
    expect(JSON.stringify(body.gridCatalog)).not.toMatch(/watt|model/i);
  });

  it("a home without an aircon can finish setup (aircon question hidden)", async () => {
    const { api, token } = await start();
    const grid = await api.put(`${setup}/appliances`, { counts: { refrigerator: 1, electric_fan: 3 } }, token);
    expect(grid.body.hasAircon).toBe(false);
    const done = await api.put(`${setup}/routine`, { home: "eveningsWeekends" }, token);
    expect(done.body).toMatchObject({ complete: true, routine: { aircon: null } });
  });

  it.each([
    [{ counts: {} }], [{ counts: { aircon: 0 } }], [{ counts: { jacuzzi: 1 } }], [{ counts: { tv: 10 } }],
    [{ counts: { tv: 1.5 } }], [{ counts: { tv: -1 } }], [{}],
  ])("rejects an invalid grid %j", async (body) => {
    const { api, token } = await start();
    expect((await api.put(`${setup}/appliances`, body, token)).status).toBe(400);
  });

  it("keeps the DOE label scan and per-appliance editing under Account → Appliances, optional and never overwritten", async () => {
    const { api, token } = await start();
    await api.put(`${setup}/appliances`, { counts: { aircon: 1, refrigerator: 1 } }, token);
    await api.put(`${setup}/routine`, { home: "allDay", aircon: "sleeping" }, token);
    const detailed = { appliances: [
      { type: "aircon", answers: { mount: "split", inverter: "yes", room: "large" }, timeRanges: [{ start: "21:00", end: "05:00", days: "everyday" }] },
      { type: "refrigerator", answers: { inverter: "yes", size: "large" } },
    ] };
    expect((await api.put(`/api/households/${SIN}/appliances`, detailed, token)).status).toBe(200);
    await api.put(`${setup}/routine`, { home: "daytime", aircon: "mostOfDay" }, token);
    const after = (await api.get(`/api/households/${SIN}/appliances`, token)).body.appliances;
    expect(after.map((a: { type: string }) => a.type)).toEqual(["aircon", "refrigerator"]);
    expect(after[0].timeRanges).toEqual(detailed.appliances[0]!.timeRanges);
    expect((await api.upload(`/api/households/${SIN}/appliances/scan-label`, undefined, undefined, token, { type: "aircon" })).status).not.toBe(404);
  });

  it("'Snap your aircon' estimates its size from a photo, tagged 'Estimated from photo'", async () => {
    const vision = Object.assign(fakeVision({ readable: false }), {
      async readAirconPhoto() { return { readable: true, mount: "split" as const, inverter: "yes" as const, room: "large" as const }; },
    });
    const { api, token } = await start({ vision });
    await api.put(`${setup}/appliances`, { counts: { aircon: 1 } }, token);
    const photo = await api.upload(`${setup}/aircon-photo`, undefined, undefined, token);
    expect(photo.status).toBe(200);
    expect(photo.body).toEqual({ answers: { mount: "split", inverter: "yes", room: "large" }, kwhPerHour: 1.12, tag: "Estimated from photo" });
    const status = (await api.get(setup, token)).body;
    expect(status.gridCatalog.find((t: { type: string }) => t.type === "aircon")).toMatchObject({ kwh: 1.12, tag: "Estimated from photo" });
    const aircon = (await api.get(`/api/households/${SIN}/appliances`, token)).body.appliances.find((a: { type: string }) => a.type === "aircon");
    expect(aircon.answers).toEqual({ mount: "split", inverter: "yes", room: "large" });
  });

  it("the photo shortcut is optional: no vision support falls back to typical values", async () => {
    const { api, token } = await start();
    expect((await api.upload(`${setup}/aircon-photo`, undefined, undefined, token)).status).toBe(503);
  });

  it("traditional meters show the 12-bill aircon estimate as agreement", async () => {
    const { api, token } = await start();
    await api.put(`${setup}/appliances`, { counts: { aircon: 1 } }, token);
    const agree = await api.get(`${setup}/aircon-check?aircon=sleeping`, token);
    expect(agree.body).toMatchObject({ source: "bills", available: true, chosenHours: 8, estimatedHours: 8, agrees: true, message: "Your 12 bills agree: about 8 hours a day." });
    const differ = await api.get(`${setup}/aircon-check?aircon=mostOfDay`, token);
    expect(differ.body).toMatchObject({ agrees: false, chosenHours: 16 });
    expect(differ.body.message).toMatch(/suggest about 8 hours/);
    expect((await api.get(`${setup}/aircon-check?aircon=always`, token)).status).toBe(400);
  });

  it("smart meters reuse the reading pattern and fall back quietly without evidence", async () => {
    const { api, token } = await start();
    const res = await api.get(`/api/households/${SMART}/setup/aircon-check?aircon=sleeping`, token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "smartMeter", available: false, chosenHours: 8 });
  });
});
