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
import { AppModule } from "../../src/app.module.js";
import { configureApp } from "../../src/app.setup.js";
import type { Bill } from "../../src/domain/bill.js";
import { rateScheduleTable, type RateSchedule } from "../../src/domain/rate-schedule.js";
import { inMemoryBillSource, type BillSource } from "../../src/bills/bill-source.js";
import { AUTH_CLOCK, BILL_SOURCE, MY_MERALCO_SOURCE, RATE_SCHEDULES, VISION_PROVIDER, WEATHER_PROVIDER } from "../../src/common/injection-tokens.js";
import type { AuthClock } from "../../src/auth/auth.service.js";
import { mockMyMeralcoSource, type MockMeralcoLogin, type MyMeralcoSource } from "../../src/bills/myMeralcoSource.js";
import type { RawBillReading, VisionProvider } from "../../src/vision/vision-provider.interface.js";
import { FakeWeatherProvider } from "../../src/weather/fake-weather.provider.js";
import type { WeatherProvider } from "../../src/weather/weather-provider.interface.js";

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

/** Synthetic accounts independent of the public demo login. */
export const testLogins: MockMeralcoLogin[] = [
  {
    ownerId: "owner-a", email: "owner-a@example.test", password: "test-password-a",
    households: [
      { sin: "1234567890", masked_address: "••• City A", meter_type: "traditional" },
      { sin: "9876543210", masked_address: "••• City B", meter_type: "smart" },
    ],
  },
  {
    ownerId: "owner-b", email: "owner-b@example.test", password: "test-password-b",
    households: [{ sin: "5555555555", masked_address: "••• City C", meter_type: "traditional" }],
  },
  { ownerId: "owner-empty", email: "empty@example.test", password: "test-password-empty", households: [] },
];

export interface HarnessOptions {
  myMeralco?: MyMeralcoSource;
  clock?: AuthClock;
  schedules?: RateSchedule[];
  /** Bills per Service ID Number, served by a fake Bill source. */
  bills?: Record<string, Bill[]>;
  /** Or a fully custom Bill source. */
  billSource?: BillSource;
  /** What the fake vision model "reads" from any photo, or a custom provider. */
  vision?: RawBillReading | VisionProvider;
  /** Fake weather observations or a custom weather provider. */
  weather?: WeatherProvider | Record<string, number>;
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
    .overrideProvider(MY_MERALCO_SOURCE)
    .useValue(opts.myMeralco ?? mockMyMeralcoSource(testLogins))
    .overrideProvider(AUTH_CLOCK)
    .useValue(opts.clock ?? { now: () => Date.now() })
    .overrideProvider(VISION_PROVIDER)
    .useValue(
      isProvider(opts.vision)
        ? opts.vision
        : fakeVision(opts.vision ?? { readable: false, problem: "no fake reading configured" }),
    )
    .overrideProvider(WEATHER_PROVIDER)
    .useValue(
      opts.weather && typeof (opts.weather as WeatherProvider).getCddPerDay === "function"
        ? opts.weather
        : new FakeWeatherProvider(opts.weather as Record<string, number> | undefined),
    )
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  open.push(app);
  const server = app.getHttpServer();

  return {
    app,
    async login(email = testLogins[0]!.email, password = testLogins[0]!.password): Promise<string> {
      const res = await request(server).post("/api/auth/login").send({ email, password });
      if (res.status !== 200) throw new Error(`Test login failed: HTTP ${res.status}`);
      return res.body.token;
    },
    async post(path: string, body: unknown, token?: string) {
      const req = request(server).post(path);
      if (token !== undefined) req.set("Authorization", `Bearer ${token}`);
      const res = await req.send(body as object);
      return { status: res.status, body: res.body as any };
    },
    async put(path: string, body: unknown, token?: string) {
      const req = request(server).put(path);
      if (token !== undefined) req.set("Authorization", `Bearer ${token}`);
      const res = await req.send(body as object);
      return { status: res.status, body: res.body as any };
    },
    /** Upload a photo as multipart form data, like the PWA does. */
    async upload(path: string, photo: Buffer = Buffer.from("fake-jpeg"), mimeType = "image/jpeg") {
      const res = await request(server).post(path).attach("photo", photo, { filename: "bill.jpg", contentType: mimeType });
      return { status: res.status, body: res.body as any };
    },
    async get(path: string, token?: string) {
      const req = request(server).get(path);
      if (token !== undefined) req.set("Authorization", `Bearer ${token}`);
      const res = await req;
      return { status: res.status, body: res.body as any };
    },
  };
}
