import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FallbackVisionProvider } from "../src/vision/fallback-vision.provider.js";
import { GeminiVisionProvider } from "../src/vision/gemini-vision.provider.js";
import { MlVisionProvider } from "../src/vision/ml-vision.provider.js";
import { VisionUnavailableError, type VisionProvider } from "../src/vision/vision-provider.interface.js";
import { visionProvider } from "../src/vision/vision.module.js";

/** A stand-in for the ML service's POST /ocr/bill. */
let server: Server;
let base = "";
let lastRequest: { url?: string; contentType?: string; body: string } = { body: "" };
let reply: { status: number; body: unknown } = { status: 200, body: {} };

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      lastRequest = { url: req.url, contentType: req.headers["content-type"], body: Buffer.concat(chunks).toString("latin1") };
      res.writeHead(reply.status, { "content-type": "application/json" }).end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const photo = { mimeType: "image/jpeg", data: Buffer.from("fake-jpeg-bytes") };
const gemini: VisionProvider = {
  readBill: async () => { throw new Error("bills must not go to Gemini in ml mode"); },
  readEnergyLabel: async () => ({ readable: true, type: "aircon", consumptionKwh: 90, period: "monthly", referenceDays: 30, referenceHoursPerDay: 8 }),
  readAppliancePhoto: async () => ({ readable: true, type: "aircon", answers: { mount: "split", inverter: "yes", room: "medium" } }),
};

describe("MlVisionProvider (bill scan through the ML service)", () => {
  it("uploads the photo as multipart 'photo' and keeps only the fields the app uses", async () => {
    reply = {
      status: 200,
      body: {
        readable: true, period: "2026-05", billingDays: 30, kwh: 200, dueDate: "2026-05-20", previousReading: 47643, presentReading: 47843,
        estimated: false, serviceIdNumber: null, customerAccountNumber: "1234567890",
        chargeLines: [{ label: "Generation", amount: 1758.84 }], history: [{ period: "2026-04", kwh: 180 }],
        chargesTotal: 1758.84, chargesAddUp: true, seconds: 9.1, ocrText: null,
      },
    };
    const r = await new MlVisionProvider(gemini, base).readBill(photo);
    expect(lastRequest.url).toBe("/ocr/bill");
    expect(lastRequest.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(lastRequest.body).toContain('name="photo"; filename="bill.jpg"');
    expect(lastRequest.body).toContain("fake-jpeg-bytes");
    expect(r).toEqual({
      readable: true, problem: undefined, period: "2026-05", billingDays: 30, kwh: 200, dueDate: "2026-05-20",
      previousReading: 47643, presentReading: 47843, estimated: false, serviceIdNumber: null, customerAccountNumber: "1234567890",
      chargeLines: [{ label: "Generation", amount: 1758.84 }], history: [{ period: "2026-04", kwh: 180 }],
    });
  });

  it("passes through an unreadable photo", async () => {
    reply = { status: 200, body: { readable: false, problem: "This doesn't look like the front page of a Meralco bill." } };
    expect(await new MlVisionProvider(gemini, base).readBill(photo)).toMatchObject({ readable: false, problem: expect.stringContaining("Meralco bill") });
  });

  it("turns a rejected file (400/413) into an unreadable result", async () => {
    reply = { status: 400, body: { detail: "The file is not a readable image." } };
    expect(await new MlVisionProvider(gemini, base).readBill(photo)).toEqual({ readable: false, problem: "The file is not a readable image." });
  });

  it("says 'not set up' (503 in the API) when the ML service is not running", async () => {
    await expect(new MlVisionProvider(gemini, "http://127.0.0.1:1").readBill(photo)).rejects.toBeInstanceOf(VisionUnavailableError);
  });

  it("fails (502 in the API) when the ML service errors", async () => {
    reply = { status: 500, body: { detail: "boom" } };
    await expect(new MlVisionProvider(gemini, base).readBill(photo)).rejects.toThrow("HTTP 500");
  });

  it("keeps energy label and appliance photos on the other provider", async () => {
    const p = new MlVisionProvider(gemini, base);
    expect(await p.readEnergyLabel(photo)).toMatchObject({ readable: true, consumptionKwh: 90 });
    expect(await p.readAppliancePhoto(photo)).toMatchObject({ type: "aircon", answers: { mount: "split" } });
  });
});

describe("VISION_PROVIDER switch", () => {
  it("defaults to Gemini with the ML service as fallback; 'gemini' and 'ml' use one reader only", () => {
    expect(visionProvider(undefined)).toBeInstanceOf(FallbackVisionProvider);
    expect(visionProvider("gemini-ml")).toBeInstanceOf(FallbackVisionProvider);
    expect(visionProvider("gemini")).toBeInstanceOf(GeminiVisionProvider);
    expect(visionProvider("ml")).toBeInstanceOf(MlVisionProvider);
  });
});
