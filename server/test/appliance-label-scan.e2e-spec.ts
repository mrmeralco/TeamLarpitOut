import { describe, expect, it } from "vitest";
import { GeminiVisionProvider } from "../src/vision/gemini-vision.provider.js";
import { VisionUnavailableError, type RawEnergyLabelReading } from "../src/vision/vision-provider.interface.js";
import { bill, fakeVision, harness } from "./utils/test-harness.js";

const SIN = "1234567890";
const path = `/api/households/${SIN}/appliances`;
const aircon: RawEnergyLabelReading = {
  readable: true, type: "aircon", consumptionKwh: 270, period: "monthly", referenceDays: 30, referenceHoursPerDay: 9,
};

async function setup(reading: RawEnergyLabelReading = aircon) {
  const vision = fakeVision({ readable: false }, reading);
  const api = await harness({ vision, bills: { [SIN]: [bill("2026-10", 240, 30)] } });
  const token = await api.login();
  const scan = (type = "aircon", photo = Buffer.from("label"), mime = "image/jpeg") =>
    api.upload(`${path}/scan-label`, photo, mime, token, { type });
  return { api, token, vision, scan };
}

describe("POST /api/households/:sin/appliances/scan-label", () => {
  it.each(["aircon", "refrigerator"] as const)("reads a %s draft without writing, then saves only corrected confirmed values", async (type) => {
    const { api, token, scan, vision } = await setup(type === "aircon" ? aircon : {
      readable: true, type, consumptionKwh: 30, period: "monthly", referenceDays: 30,
    });
    const initial = await api.put(path, { appliances: [{ type: "wifi" }] }, token);
    const result = await scan(type);
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body).toMatchObject({ status: "read", type, needsConfirmation: true, missing: [], assumptions: [] });
    expect(result.body.label).not.toHaveProperty("confirmed");
    expect(result.body.kwhPerHour).toBeCloseTo(type === "aircon" ? 1 : 1 / 24, 12);
    expect(vision.labelsSeen).toEqual([{ mimeType: "image/jpeg", bytes: 5 }]);
    expect(vision.seen).toEqual([]);
    expect((await api.get(path, token)).body).toEqual(initial.body);
    const routine = type === "aircon" ? { timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }] } : {};
    // An extracted draft cannot be saved without explicit confirmation.
    expect((await api.put(path, { appliances: [{ type, ...routine, energyLabel: result.body.label }] }, token)).status).toBe(400);
    const saved = await api.put(path, { appliances: [{ type, ...routine, energyLabel: {
      ...result.body.label, consumptionKwh: type === "aircon" ? 135 : 60, confirmed: true,
    } }] }, token);
    expect(saved.status).toBe(200);
    expect(saved.body.appliances[0]).toMatchObject({ source: "label", sourceLabel: "From the energy label", estimatedKwhPerDay: type === "aircon" ? 4 : 2 });
    expect((await api.get(path, token)).body).toEqual(saved.body);
  });

  it("flags unprinted reference assumptions, preserves printed hours, and never invents consumption", async () => {
    const { scan } = await setup({ readable: true, type: "aircon", period: "monthly" });
    const { body } = await scan();
    expect(body.label).toEqual({ consumptionKwh: null, period: "monthly", referenceDays: 30, referenceHoursPerDay: 9 });
    expect(body.missing).toEqual(["consumptionKwh"]);
    expect(body.kwhPerHour).toBeNull();
    expect(body.assumptions.map((a: any) => [a.field, a.value])).toEqual([["referenceDays", 30], ["referenceHoursPerDay", 9]]);

    const printed = await setup({ ...aircon, referenceHoursPerDay: 6 });
    expect((await printed.scan()).body).toMatchObject({ kwhPerHour: 1.5, assumptions: [] });
  });

  it("normalizes daily consumption and lists invalid fields for correction", async () => {
    const daily = await setup({ ...aircon, consumptionKwh: 9, period: "daily", referenceDays: null });
    expect((await daily.scan()).body).toMatchObject({ label: { referenceDays: 1 }, kwhPerHour: 1, missing: [], assumptions: [] });
    const invalid = await setup({ ...aircon, consumptionKwh: -2, period: "annual" as any, referenceDays: 0, referenceHoursPerDay: 25 });
    const { status, body } = await invalid.scan();
    expect(status).toBe(200);
    expect(body.missing).toEqual(["consumptionKwh", "period", "referenceDays", "referenceHoursPerDay"]);
    expect(body.kwhPerHour).toBeNull();
    expect(body.assumptions).toEqual([]);
  });

  it.each([
    { readable: false }, { ...aircon, type: "refrigerator" }, { ...aircon, type: null }, null, { readable: "yes", type: "aircon" },
  ])("rejects an unreadable or mismatched result: %j", async (reading) => {
    const { scan, api, token } = await setup(reading as RawEnergyLabelReading);
    const result = await scan();
    expect(result.status).toBe(422);
    expect(result.body.status).toBe("unreadable");
    expect((await api.get(path, token)).body.saved).toBe(false);
  });

  it("checks ownership before invoking vision", async () => {
    const { api, token, vision } = await setup();
    expect((await api.upload(`${path}/scan-label`, undefined, undefined, undefined, { type: "aircon" })).status).toBe(401);
    for (const sin of ["5555555555", "0000000000"]) {
      expect((await api.upload(`/api/households/${sin}/appliances/scan-label`, undefined, undefined, token, { type: "aircon" })).status).toBe(404);
    }
    expect(vision.labelsSeen).toEqual([]);
  });

  it("rejects missing/unsupported input and photos larger than 10 MiB before vision", async () => {
    const { api, token, scan, vision } = await setup();
    expect((await api.post(`${path}/scan-label`, { type: "aircon" }, token)).status).toBe(400);
    expect((await scan("wifi")).status).toBe(400);
    expect((await api.upload(`${path}/scan-label`, undefined, undefined, token)).status).toBe(400);
    expect((await scan("aircon", Buffer.from("pdf"), "application/pdf")).status).toBe(400);
    expect((await scan("aircon", Buffer.alloc(10 * 1024 * 1024 + 1))).status).toBe(413);
    expect(vision.labelsSeen).toEqual([]);
  });

  it.each(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])("accepts %s", async (mime) => {
    const { scan, vision } = await setup();
    expect((await scan("aircon", Buffer.from("photo"), mime)).status).toBe(200);
    expect(vision.labelsSeen[0]?.mimeType).toBe(mime);
  });

  it.each([[new VisionUnavailableError("no key"), 503], [new Error("provider failed"), 502]] as const)("maps provider failures to a recoverable error", async (error, status) => {
    const api = await harness({ vision: {
      readBill: async () => ({ readable: false }), readEnergyLabel: async () => { throw error; },
    } });
    const token = await api.login();
    const result = await api.upload(`${path}/scan-label`, undefined, undefined, token, { type: "aircon" });
    expect(result.status).toBe(status);
    expect(result.body.error).toMatch(/use your answers/i);
    expect((await api.get(path, token)).body.saved).toBe(false);
  });

  it("requires vision configuration without making a network request", async () => {
    await expect(new GeminiVisionProvider("").readEnergyLabel({ mimeType: "image/jpeg", data: Buffer.from("image") })).rejects.toBeInstanceOf(VisionUnavailableError);
  });
});
