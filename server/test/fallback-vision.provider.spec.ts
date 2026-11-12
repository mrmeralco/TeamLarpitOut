import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FallbackVisionProvider } from "../src/vision/fallback-vision.provider.js";
import { VisionUnavailableError, type RawBillReading, type VisionProvider } from "../src/vision/vision-provider.interface.js";

const photo = { mimeType: "image/jpeg", data: Buffer.from("photo") };
const fromGemini: RawBillReading = { readable: true, period: "2026-09", kwh: 381, billingDays: 31 };
const fromMl: RawBillReading = { readable: true, period: "2026-09", kwh: 381, billingDays: 31, previousReading: 76456 };

/** A reader that answers, fails or hangs, and counts its calls. */
function reader(behaviour: RawBillReading | Error | "hang") {
  const calls = { bill: 0, label: 0, aircon: 0 };
  const provider: VisionProvider = {
    async readBill() {
      calls.bill++;
      if (behaviour === "hang") return new Promise<RawBillReading>(() => {});
      if (behaviour instanceof Error) throw behaviour;
      return behaviour;
    },
    async readEnergyLabel() { calls.label++; return { readable: false }; },
    async readAirconPhoto() { calls.aircon++; return { readable: false }; },
  };
  return Object.assign(provider, { calls });
}

const quota = Object.assign(new Error("RESOURCE_EXHAUSTED: quota exceeded"), { status: 429 });

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("FallbackVisionProvider: Gemini reads the Bill, the ML service is the fallback", () => {
  it("uses Gemini's reading and never calls the ML service when Gemini answers", async () => {
    const gemini = reader(fromGemini);
    const ml = reader(fromMl);
    expect(await new FallbackVisionProvider(gemini, ml).readBill(photo)).toEqual(fromGemini);
    expect(ml.calls.bill).toBe(0);
  });

  it("keeps Gemini's 'unreadable' answer (the customer retakes the photo)", async () => {
    const ml = reader(fromMl);
    const r = await new FallbackVisionProvider(reader({ readable: false, problem: "Blurry" }), ml).readBill(photo);
    expect(r).toEqual({ readable: false, problem: "Blurry" });
    expect(ml.calls.bill).toBe(0);
  });

  it.each([
    ["quota used up (429)", quota],
    ["no API key", new VisionUnavailableError("GEMINI_API_KEY is not set")],
    ["any other error", new Error("fetch failed")],
  ])("falls back to the ML service when Gemini fails: %s", async (_name, err) => {
    const ml = reader(fromMl);
    expect(await new FallbackVisionProvider(reader(err), ml).readBill(photo)).toEqual(fromMl);
    expect(ml.calls.bill).toBe(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("reading it with the ML service instead"));
  });

  it("falls back when Gemini does not answer in time", async () => {
    const ml = reader(fromMl);
    expect(await new FallbackVisionProvider(reader("hang"), ml, 20).readBill(photo)).toEqual(fromMl);
  });

  it("says 'not set up' (503) when neither Gemini nor the ML service is available", async () => {
    const p = new FallbackVisionProvider(reader(new VisionUnavailableError("no key")), reader(new VisionUnavailableError("ML service not reachable")));
    await expect(p.readBill(photo)).rejects.toBeInstanceOf(VisionUnavailableError);
  });

  it("reports Gemini's real error (502) when Gemini failed and the ML service is not running", async () => {
    const p = new FallbackVisionProvider(reader(quota), reader(new VisionUnavailableError("ML service not reachable")));
    await expect(p.readBill(photo)).rejects.toBe(quota);
  });

  it("reports the ML service's error when Gemini had no key and the ML service failed", async () => {
    const mlError = new Error("ML service /ocr/bill answered HTTP 500");
    const p = new FallbackVisionProvider(reader(new VisionUnavailableError("no key")), reader(mlError));
    await expect(p.readBill(photo)).rejects.toBe(mlError);
  });

  it("reads energy labels and aircon photos with Gemini only", async () => {
    const gemini = reader(fromGemini);
    const ml = reader(fromMl);
    const p = new FallbackVisionProvider(gemini, ml);
    await p.readEnergyLabel(photo);
    await p.readAirconPhoto(photo);
    expect([gemini.calls.label, gemini.calls.aircon, ml.calls.label, ml.calls.aircon]).toEqual([1, 1, 0, 0]);
  });
});
