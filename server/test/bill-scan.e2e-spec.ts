import { describe, expect, it } from "vitest";
import { VisionUnavailableError, type RawBillReading } from "../src/vision/vision-provider.interface.js";
import { bill, fakeVision, harness } from "./utils/test-harness.js";

/** What a good photo of an October 2026 Bill reads as. */
const october: RawBillReading = {
  readable: true,
  serviceIdNumber: "1234567890",
  period: "2026-10",
  billingDays: 32,
  kwh: 240,
  dueDate: "2026-11-05",
  previousReading: 10450,
  presentReading: 10690,
  chargeLines: [
    { label: "Generation", amount: 1584 },
    { label: "Distribution", amount: 1056 },
    { label: "Supply", amount: 50 },
  ],
  history: [
    { period: "2026-08", kwh: 230 },
    { period: "2026-09", kwh: 200 },
  ],
};

describe("POST /api/bills/scan", () => {
  it("prefills editable fields from the photo and asks for confirmation", async () => {
    const vision = fakeVision(october);
    const api = await harness({ vision });
    const { status, body } = await api.userUpload("/api/bills/scan");

    expect(status).toBe(200);
    expect(vision.seen).toEqual([{ mimeType: "image/jpeg", bytes: 9 }]);
    expect(body.status).toBe("read");
    expect(body.needsConfirmation).toBe(true);
    expect(body.now).toMatchObject({
      period: "2026-10",
      kwh: 240,
      billingDays: 32,
      dueDate: "2026-11-05",
      previousReading: 10450,
      presentReading: 10690,
    });
    expect(body.now.chargeLines).toHaveLength(3);
    expect(body.missing).toEqual([]);
  });

  it("carries the printed 'estimated' mark into the draft", async () => {
    const api = await harness({ vision: { ...october, estimated: true } });
    const { body } = await api.userUpload("/api/bills/scan");
    expect(body.now.estimated).toBe(true);
  });

  it("does not use the reading: no split is computed until the user confirms", async () => {
    const api = await harness({ vision: october });
    const { body } = await api.userUpload("/api/bills/scan");
    expect(body.effects).toBeUndefined();
    expect(body.total).toBeUndefined();
  });

  it("shows the Service ID Number masked and never returns it in full", async () => {
    const api = await harness({ vision: october });
    const { body } = await api.userUpload("/api/bills/scan");
    expect(body.serviceIdMasked).toBe("••••••7890");
    expect(JSON.stringify(body)).not.toContain("1234567890");
  });

  it("takes the previous month from the Bill's printed history, with billing days flagged as estimated", async () => {
    const api = await harness({ vision: october });
    const { body } = await api.userUpload("/api/bills/scan");
    expect(body.before).toMatchObject({ period: "2026-09", kwh: 200, billingDays: 32 });
    expect(body.estimated).toEqual(["before.billingDays"]);
  });

  it("leaves the previous Bill empty when no history is printed (second upload or typing)", async () => {
    const api = await harness({ vision: { ...october, history: null } });
    const { body } = await api.userUpload("/api/bills/scan");
    expect(body.before).toBeNull();
    expect(body.estimated).toEqual([]);
  });

  it("confirmed fields drive the same split as typed Bills", async () => {
    const api = await harness({ vision: october });
    const scan = (await api.userUpload("/api/bills/scan")).body;

    // The user confirms; they correct the estimated previous billing days to 30.
    const confirmed = { before: { ...scan.before, billingDays: 30 }, now: scan.now };
    const fromScan = await api.userPost("/api/bakit-ganito", confirmed);
    const typed = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-09", 200, 30),
      now: bill("2026-10", 240, 32),
    });

    expect(fromScan.status).toBe(200);
    expect(fromScan.body.effects).toEqual(typed.body.effects);
    expect(fromScan.body.total).toBe(typed.body.total);
    expect(fromScan.body.total).toBe(64_000);
  });

  it("lists key fields the model could not read, dropping values that are not valid", async () => {
    const api = await harness({
      vision: { readable: true, period: "Oct 2026", kwh: -5, billingDays: 32, chargeLines: [{ label: "", amount: 5 }] },
    });
    const { status, body } = await api.userUpload("/api/bills/scan");
    expect(status).toBe(200);
    expect(body.missing).toEqual(["period", "kwh"]);
    expect(body.now.period).toBeUndefined();
    expect(body.now.chargeLines).toEqual([]);
    expect(body.before).toBeNull();
  });

  it("asks for a retake or manual entry when the photo is unreadable", async () => {
    const api = await harness({ vision: { readable: false, problem: "Blurry photo" } });
    const { status, body } = await api.userUpload("/api/bills/scan");
    expect(status).toBe(422);
    expect(body).toEqual({ status: "unreadable", problem: "Blurry photo" });
  });

  it("treats a 'readable' photo with none of kWh, billing days or period as unreadable", async () => {
    const api = await harness({ vision: { readable: true, dueDate: "2026-11-05" } });
    const { status, body } = await api.userUpload("/api/bills/scan");
    expect(status).toBe(422);
    expect(body.status).toBe("unreadable");
    expect(body.problem).toMatch(/Retake/);
  });

  it("returns 503 so the PWA falls back to typing when no vision model is configured", async () => {
    const api = await harness({
      vision: {
        readEnergyLabel: async () => ({ readable: false }),
        readBill: async () => {
          throw new VisionUnavailableError("no key");
        },
      },
    });
    const { status, body } = await api.userUpload("/api/bills/scan");
    expect(status).toBe(503);
    expect(body.status).toBe("unavailable");
  });

  it("rejects a missing photo and non-image files", async () => {
    const api = await harness({ vision: october });
    expect((await api.userPost("/api/bills/scan", {})).status).toBe(400);
    expect((await api.userUpload("/api/bills/scan", Buffer.from("%PDF"), "application/pdf")).status).toBe(400);
  });

  it("POST /api/bills/simulate returns simulated bill data with valid scanToken", async () => {
    const api = await harness();
    const { status, body } = await api.userPost("/api/bills/simulate", {});
    expect(status).toBe(200);
    expect(body.status).toBe("read");
    expect(body.needsConfirmation).toBe(true);
    expect(body.scanToken).toBeDefined();
    expect(body.now).toMatchObject({
      period: "2026-10",
      kwh: 240,
      billingDays: 31,
    });
    expect(body.canMasked).toBe("39•• ••• 482");
    expect(body.account).toBeDefined();
  });

  it("POST /api/bills/scan?simulate=true allows simulation without photo upload", async () => {
    const api = await harness();
    const { status, body } = await api.userPost("/api/bills/scan?simulate=true", {});
    expect(status).toBe(200);
    expect(body.status).toBe("read");
    expect(body.scanToken).toBeDefined();
  });

  it("returns 502 with quota message when vision AI quota limit is reached", async () => {
    const api = await harness({
      vision: {
        readEnergyLabel: async () => ({ readable: false }),
        readBill: async () => {
          const quotaErr = new Error("ResourceExhausted: Quota exceeded for model gemini-3.8-flash");
          (quotaErr as any).status = 429;
          throw quotaErr;
        },
      },
    });
    const { status, body } = await api.userUpload("/api/bills/scan");
    expect(status).toBe(502);
    expect(body.error).toMatch(/quota limit reached/i);
  });
});
