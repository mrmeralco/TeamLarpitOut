import { describe, expect, it } from "vitest";
import { bill, fakeVision, harness } from "./utils/test-harness.js";
import type { RawAppliancePhotoReading } from "../src/vision/vision-provider.interface.js";

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

  describe("editing appliances after setup is complete", () => {
    const types = (list: { type: string; quantity: number }[]) => list.map((a) => [a.type, a.quantity]);
    const step = (body: { steps: { key: string; done: boolean }[] }, key: string) => body.steps.find((s) => s.key === key)!.done;

    it("changing counts replaces the list; setup stays complete and Welcome Points are not granted again", async () => {
      const { api, token } = await start();
      await api.put(`${setup}/appliances`, { counts: { aircon: 1, refrigerator: 1, electric_fan: 2, tv: 1 } }, token);
      await api.put(`${setup}/routine`, { home: "allDay", aircon: "sleeping" }, token);

      const edit = await api.put(`${setup}/appliances`, { counts: { aircon: 1, refrigerator: 1, electric_fan: 3, computer: 1 } }, token);
      expect(edit.status).toBe(200);
      expect(edit.body).toMatchObject({ complete: true, doneCount: 3, grid: { aircon: 1, refrigerator: 1, electric_fan: 3, computer: 1 }, routine: { aircon: "sleeping" } });
      const list = (await api.get(`/api/households/${SIN}/appliances`, token)).body.appliances;
      expect(types(list)).toEqual([["aircon", 1], ["refrigerator", 1], ["electric_fan", 3], ["computer", 1], ["lights", 1]]);
      expect(list.find((a: { type: string }) => a.type === "aircon").hoursPerDay).toBe(8);
      const points = await api.get(`/api/households/${SIN}/points`, token);
      expect(points.body.history.filter((e: { source: string }) => e.source === "welcome")).toHaveLength(1);
    });

    it("removing the aircon clears its schedule and keeps every step done", async () => {
      const { api, token } = await start();
      await api.put(`${setup}/appliances`, { counts: { aircon: 1, refrigerator: 1 } }, token);
      await api.put(`${setup}/routine`, { home: "allDay", aircon: "mostOfDay" }, token);

      const edit = await api.put(`${setup}/appliances`, { counts: { refrigerator: 1, electric_fan: 1 } }, token);
      expect(edit.body).toMatchObject({ complete: true, hasAircon: false, routine: { home: "allDay", aircon: null } });
      expect(step(edit.body, "routine")).toBe(true);
      const list = (await api.get(`/api/households/${SIN}/appliances`, token)).body.appliances;
      expect(list.map((a: { type: string }) => a.type)).not.toContain("aircon");
    });

    it("adding an aircon leaves the routine step open until its schedule is answered", async () => {
      const { api, token } = await start();
      await api.put(`${setup}/appliances`, { counts: { refrigerator: 1 } }, token);
      await api.put(`${setup}/routine`, { home: "eveningsWeekends" }, token);

      const edit = await api.put(`${setup}/appliances`, { counts: { refrigerator: 1, aircon: 1 } }, token);
      // Still complete (Missions stay unlocked), but the routine step asks for the aircon's schedule.
      expect(edit.body).toMatchObject({ complete: true, hasAircon: true, routine: { aircon: null } });
      expect(step(edit.body, "routine")).toBe(false);

      const answered = await api.put(`${setup}/routine`, { home: "eveningsWeekends", aircon: "sleeping" }, token);
      expect(step(answered.body, "routine")).toBe(true);
      const aircon = (await api.get(`/api/households/${SIN}/appliances`, token)).body.appliances.find((a: { type: string }) => a.type === "aircon");
      expect(aircon.hoursPerDay).toBe(8);
    });
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

  /** A vision fake whose appliance photo answers come from a queue, one per upload. */
  const photoVision = (...readings: RawAppliancePhotoReading[]) => Object.assign(fakeVision({ readable: false }), {
    async readAppliancePhoto() { return readings.shift() ?? { readable: false }; },
  });

  it("'Snap an appliance' recognises an aircon and estimates its size, tagged 'Estimated from photo'", async () => {
    const vision = photoVision({ readable: true, type: "aircon", answers: { mount: "split", inverter: "yes", room: "large" } });
    const { api, token } = await start({ vision });
    await api.put(`${setup}/appliances`, { counts: { aircon: 1 } }, token);
    const photo = await api.upload(`${setup}/appliance-photo`, undefined, undefined, token);
    expect(photo.status).toBe(200);
    expect(photo.body).toEqual({
      type: "aircon", label: "Aircon", answers: { mount: "split", inverter: "yes", room: "large" },
      kwh: 1.12, unit: "kWh per hour", tag: "Estimated from photo",
    });
    const status = (await api.get(setup, token)).body;
    expect(status.gridCatalog.find((t: { type: string }) => t.type === "aircon")).toMatchObject({ kwh: 1.12, tag: "Estimated from photo" });
    const aircon = (await api.get(`/api/households/${SIN}/appliances`, token)).body.appliances.find((a: { type: string }) => a.type === "aircon");
    expect(aircon.answers).toEqual({ mount: "split", inverter: "yes", room: "large" });
  });

  it("works for any appliance, not only the aircon: each type keeps its own estimate", async () => {
    const vision = photoVision(
      { readable: true, type: "tv", answers: { size: "large", mount: "split" } }, // another type's key is ignored
      { readable: true, type: "refrigerator", answers: { inverter: "yes", size: "huge" } }, // not an option → I don't know
      { readable: true, type: "rice_cooker", answers: {} }, // no questions: recognised, typical value
    );
    const { api, token } = await start({ vision });
    await api.put(`${setup}/appliances`, { counts: { tv: 1, refrigerator: 1, rice_cooker: 1 } }, token);

    const tv = await api.upload(`${setup}/appliance-photo`, undefined, undefined, token);
    expect(tv.body).toEqual({ type: "tv", label: "TV", answers: { size: "large" }, kwh: 0.12, unit: "kWh per hour", tag: "Estimated from photo" });
    const ref = await api.upload(`${setup}/appliance-photo`, undefined, undefined, token);
    expect(ref.body).toMatchObject({ type: "refrigerator", answers: { inverter: "yes", size: "unknown" }, kwh: 0.715, unit: "kWh per day", tag: "Estimated from photo" });
    const rice = await api.upload(`${setup}/appliance-photo`, undefined, undefined, token);
    expect(rice.body).toMatchObject({ type: "rice_cooker", label: "Rice cooker", answers: {}, kwh: 0.35, unit: "kWh per use", tag: "Typical value" });

    const tiles = (await api.get(setup, token)).body.gridCatalog as { type: string; kwh: number; tag: string }[];
    expect(tiles.find((t) => t.type === "tv")).toMatchObject({ kwh: 0.12, tag: "Estimated from photo" });
    expect(tiles.find((t) => t.type === "refrigerator")).toMatchObject({ kwh: 0.715, tag: "Estimated from photo" });
    expect(tiles.find((t) => t.type === "rice_cooker")).toMatchObject({ kwh: 0.35, tag: "Typical value" });
    const list = (await api.get(`/api/households/${SIN}/appliances`, token)).body.appliances as { type: string; answers: object }[];
    expect(list.find((a) => a.type === "tv")!.answers).toEqual({ size: "large" });
    expect(list.find((a) => a.type === "refrigerator")!.answers).toEqual({ inverter: "yes", size: "unknown" });

    // Removing an appliance from the grid drops its photo estimate.
    await api.put(`${setup}/appliances`, { counts: { refrigerator: 1 } }, token);
    const after = (await api.get(setup, token)).body.gridCatalog as { type: string; tag: string }[];
    expect(after.find((t) => t.type === "tv")!.tag).toBe("Typical value");
    expect(after.find((t) => t.type === "refrigerator")!.tag).toBe("Estimated from photo");
  });

  it("a photo with no recognisable appliance is refused; tapping still works", async () => {
    const vision = photoVision({ readable: true, type: "spaceship", answers: {} }, { readable: false });
    const { api, token } = await start({ vision });
    for (let i = 0; i < 2; i++) {
      const photo = await api.upload(`${setup}/appliance-photo`, undefined, undefined, token);
      expect(photo.status).toBe(422);
      expect(photo.body.error).toMatch(/couldn't recognise an appliance/);
    }
  });

  it("the photo shortcut is optional: no vision support falls back to typical values", async () => {
    const { api, token } = await start();
    expect((await api.upload(`${setup}/appliance-photo`, undefined, undefined, token)).status).toBe(503);
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
