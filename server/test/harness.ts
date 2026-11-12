/**
 * API-level test harness. Tests talk only to the HTTP API; every external
 * source (Rate Schedules, Bill sources, later Meralco/smart meter/weather) is
 * a Nest provider overridden here, so later tickets add a fake, not a new seam.
 */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach } from "vitest";
import { AppModule, configureApp } from "../src/app.module.js";
import type { Bill } from "../src/domain/bill.js";
import { rateScheduleTable, type RateSchedule } from "../src/domain/rateSchedule.js";
import { inMemoryBillSource, type BillSource } from "../src/sources/billSource.js";
import { BILL_SOURCE, RATE_SCHEDULES, VISION_PROVIDER } from "../src/tokens.js";
import type { RawBillReading, VisionProvider } from "../src/vision/vision.js";

/** A small, round-number schedule so expected pesos are easy to check by hand. */
export function schedule(period: string, perKwh: number, fixed = 50): RateSchedule {
  return {
    period,
    perKwh: [
      { code: "generation", label: "Generation", rate: perKwh * 0.6, passThrough: true },
      { code: "distribution", label: "Distribution", rate: perKwh * 0.4, passThrough: false },
    ],
    fixed: [{ code: "supply_fixed", label: "Supply (per customer)", amount: fixed }],
    // Lifeline: 50% up to 50 kWh, 20% up to 100 kWh, on generation + distribution.
    lifeline: {
      discountedCodes: ["generation", "distribution"],
      tiers: [
        { upToKwh: 50, discount: 0.5 },
        { upToKwh: 100, discount: 0.2 },
      ],
    },
  };
}

export function bill(period: string, kwh: number, billingDays: number, chargeLines: Bill["chargeLines"] = []): Bill {
  return { period, kwh, billingDays, chargeLines };
}

export interface HarnessOptions {
  schedules?: RateSchedule[];
  /** Bills per Service ID Number, served by a fake Bill source. */
  bills?: Record<string, Bill[]>;
  /** Or a fully custom Bill source. */
  billSource?: BillSource;
  /** What the fake vision model "reads" from any photo, or a custom provider. */
  vision?: RawBillReading | VisionProvider;
}

/** Fake vision provider: returns a fixed reading and records the images it got. */
export function fakeVision(reading: RawBillReading) {
  const seen: { mimeType: string; bytes: number }[] = [];
  const provider: VisionProvider = {
    async readBill(image) {
      seen.push({ mimeType: image.mimeType, bytes: image.data.length });
      return reading;
    },
  };
  return Object.assign(provider, { seen });
}

const isProvider = (v: unknown): v is VisionProvider => typeof (v as VisionProvider)?.readBill === "function";

const open: INestApplication[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

export async function harness(opts: HarnessOptions = {}) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RATE_SCHEDULES)
    .useValue(rateScheduleTable(opts.schedules ?? [schedule("2026-09", 10), schedule("2026-10", 11)]))
    .overrideProvider(BILL_SOURCE)
    .useValue(opts.billSource ?? inMemoryBillSource(opts.bills ?? {}))
    .overrideProvider(VISION_PROVIDER)
    .useValue(
      isProvider(opts.vision)
        ? opts.vision
        : fakeVision(opts.vision ?? { readable: false, problem: "no fake reading configured" }),
    )
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  open.push(app);
  const server = app.getHttpServer();

  return {
    app,
    async post(path: string, body: unknown) {
      const res = await request(server).post(path).send(body as object);
      return { status: res.status, body: res.body as any };
    },
    /** Upload a photo as multipart form data, like the PWA does. */
    async upload(path: string, photo: Buffer = Buffer.from("fake-jpeg"), mimeType = "image/jpeg") {
      const res = await request(server).post(path).attach("photo", photo, { filename: "bill.jpg", contentType: mimeType });
      return { status: res.status, body: res.body as any };
    },
    async get(path: string) {
      const res = await request(server).get(path);
      return { status: res.status, body: res.body as any };
    },
  };
}
