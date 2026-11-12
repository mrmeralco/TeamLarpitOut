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
import { inMemoryOutageSource, type OutageRecord, type OutageSource } from "../../src/bills/outage-source.js";
import { AUTH_CLOCK, BILL_SOURCE, COACH_PROVIDER, EMAIL_SENDER, HOUSEHOLD_LINKS, MERALCO_ACCOUNTS, OUTAGE_SOURCE, RATE_SCHEDULES, READING_SOURCE, SIGN_IN_CODE_GENERATOR, VISION_PROVIDER, WEATHER_PROVIDER } from "../../src/common/injection-tokens.js";
import { inMemoryReadingSource, type ReadingSource } from "../../src/smart-meter/reading-source.interface.js";
import type { HourlyReading } from "../../src/domain/meter-reading.js";
import type { CoachProvider } from "../../src/coach/coach-provider.interface.js";
import { TemplateCoachProvider } from "../../src/coach/template-coach.provider.js";
import { ownerIdForEmail, type AuthClock } from "../../src/auth/auth.service.js";
import type { EmailSender } from "../../src/auth/email-sender.interface.js";
import { mockMeralcoAccounts, type MeralcoAccount, type MeralcoAccountSource } from "../../src/bills/meralco-accounts.js";
import type { Household } from "../../src/domain/household.js";
import { InMemoryHouseholdLinkRepository, type HouseholdLink } from "../../src/households/household-link.repository.js";
import type { RawBillReading, RawEnergyLabelReading, VisionProvider } from "../../src/vision/vision-provider.interface.js";
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

/** Synthetic logins and their already-linked Households (independent of the demo accounts). */
export const testLogins: { email: string; households: Household[] }[] = [
  {
    email: "owner-a@example.test",
    households: [
      { sin: "1234567890", masked_address: "••• City A", meter_type: "traditional" },
      { sin: "9876543210", masked_address: "••• City B", meter_type: "smart" },
    ],
  },
  { email: "owner-b@example.test", households: [{ sin: "5555555555", masked_address: "••• City C", meter_type: "traditional" }] },
  { email: "empty@example.test", households: [] },
];

/** The mock Meralco accounts behind testLogins, keyed by CAN. */
export const testAccounts: MeralcoAccount[] = [
  { can: "1000000001", sin: "1234567890", area: "City A", meter_type: "traditional" },
  { can: "1000000002", sin: "9876543210", area: "City B", meter_type: "smart" },
  { can: "1000000003", sin: "5555555555", area: "City C", meter_type: "traditional" },
];

/** The fixed code every test sign-in receives. */
export const TEST_CODE = "123456";

/** Active links per email: login → linked Service ID Numbers. */
export function activeLinks(byEmail: Record<string, string[]>, accounts: MeralcoAccount[] = testAccounts): HouseholdLink[] {
  return Object.entries(byEmail).flatMap(([email, sins]) => sins.map((sin) => ({
    ownerId: ownerIdForEmail(email), sin, can: accounts.find((a) => a.sin === sin)?.can ?? sin, status: "active" as const,
  })));
}

const defaultLinks = () => Object.fromEntries(testLogins.map((l) => [l.email, l.households.map((h) => h.sin)]));

/** Records every code "sent", so tests can read it like an inbox. */
export function fakeEmailSender() {
  const sent: { email: string; code: string }[] = [];
  const sender: EmailSender = { async sendSignInCode(email, code) { sent.push({ email, code }); } };
  return Object.assign(sender, { sent });
}

export interface HarnessOptions {
  /** Mock Meralco accounts (by CAN), or a custom account source. */
  accounts?: MeralcoAccount[];
  meralco?: MeralcoAccountSource;
  /** Active links per email; defaults to testLogins. */
  links?: Record<string, string[]>;
  /** How sign-in codes are made; defaults to TEST_CODE. */
  codes?: () => string;
  clock?: AuthClock;
  schedules?: RateSchedule[];
  /** Bills per Service ID Number, served by a fake Bill source. */
  bills?: Record<string, Bill[]>;
  /** Or a fully custom Bill source. */
  billSource?: BillSource;
  /** Hourly consumption per SIN, or a custom source independent of Bill/weather fakes. */
  readings?: Record<string, HourlyReading[]>;
  readingSource?: ReadingSource;
  /** What the fake vision model "reads" from any photo, or a custom provider. */
  vision?: RawBillReading | VisionProvider;
  /** Fake weather observations or a custom weather provider. */
  weather?: WeatherProvider | Record<string, number>;
  /** Outage records or custom outage source for brownouts. */
  outages?: OutageRecord[] | OutageSource;
  outageSource?: OutageSource;
  /** The AI Coach; defaults to the deterministic template so tests never call an AI. */
  coach?: CoachProvider;
}

/** Fake vision provider: returns a fixed reading and records the images it got. */
export function fakeVision(reading: RawBillReading, labelReading: RawEnergyLabelReading = { readable: false }) {
  const seen: { mimeType: string; bytes: number }[] = [];
  const labelsSeen: { mimeType: string; bytes: number }[] = [];
  const provider: VisionProvider = {
    async readBill(image) {
      seen.push({ mimeType: image.mimeType, bytes: image.data.length });
      return reading;
    },
    async readEnergyLabel(image) {
      labelsSeen.push({ mimeType: image.mimeType, bytes: image.data.length });
      return labelReading;
    },
  };
  return Object.assign(provider, { seen, labelsSeen });
}

const isProvider = (v: unknown): v is VisionProvider => typeof (v as VisionProvider)?.readBill === "function";

const open: INestApplication[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

export async function harness(opts: HarnessOptions = {}) {
  const accounts = opts.accounts ?? testAccounts;
  const links = new InMemoryHouseholdLinkRepository(activeLinks(opts.links ?? defaultLinks(), accounts));
  const email = fakeEmailSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RATE_SCHEDULES)
    .useValue(rateScheduleTable(opts.schedules ?? [schedule("2026-09", 10), schedule("2026-10", 11)]))
    .overrideProvider(BILL_SOURCE)
    .useValue(opts.billSource ?? inMemoryBillSource(opts.bills ?? {}))
    .overrideProvider(READING_SOURCE)
    .useValue(opts.readingSource ?? inMemoryReadingSource(opts.readings ?? {}))
    .overrideProvider(MERALCO_ACCOUNTS)
    .useValue(opts.meralco ?? mockMeralcoAccounts(accounts))
    .overrideProvider(HOUSEHOLD_LINKS)
    .useValue(links)
    .overrideProvider(EMAIL_SENDER)
    .useValue(email)
    .overrideProvider(SIGN_IN_CODE_GENERATOR)
    .useValue(opts.codes ?? (() => TEST_CODE))
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
    .overrideProvider(COACH_PROVIDER)
    .useValue(opts.coach ?? new TemplateCoachProvider())
    .overrideProvider(OUTAGE_SOURCE)
    .useValue(
      opts.outageSource ??
        (opts.outages && typeof (opts.outages as OutageSource).hasOutage === "function"
          ? (opts.outages as OutageSource)
          : inMemoryOutageSource(Array.isArray(opts.outages) ? opts.outages : [])),
    )
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  open.push(app);
  const server = app.getHttpServer();
  let cachedToken: string | undefined;

  return {
    app,
    links,
    email,
    /** Email-code sign-in through the API; returns the session token. */
    async login(address = testLogins[0]!.email): Promise<string> {
      const started = await request(server).post("/api/auth/email/start").send({ email: address });
      if (started.status !== 202) throw new Error(`Test sign-in start failed: HTTP ${started.status}`);
      const code = email.sent.at(-1)!.code;
      const res = await request(server).post("/api/auth/email/verify").send({ email: address, code });
      if (res.status !== 200) throw new Error(`Test sign-in failed: HTTP ${res.status}`);
      return res.body.token;
    },
    async post(path: string, body: unknown, token?: string) {
      const req = request(server).post(path);
      if (token !== undefined) req.set("Authorization", `Bearer ${token}`);
      const res = await req.send(body as object);
      return { status: res.status, body: res.body as any };
    },
    /** POST as the default signed-in test login (owner-a). */
    async userPost(path: string, body: unknown) {
      return this.post(path, body, await this.userToken());
    },
    /** Upload as the default signed-in test login (owner-a). */
    async userUpload(path: string, photo?: Buffer, mimeType?: string, fields: Record<string, string> = {}) {
      return this.upload(path, photo, mimeType, await this.userToken(), fields);
    },
    async userToken(): Promise<string> {
      cachedToken ??= await this.login();
      return cachedToken;
    },
    /** Household Setup's household and routine steps (appliances are saved by the test itself). */
    async completeSetup(sin: string, token: string) {
      const household = await this.put(`/api/households/${sin}/setup/household`, { size: 4 }, token);
      const routine = await this.put(`/api/households/${sin}/setup/routine`, { home: "eveningsWeekends", aircon: "sleeping" }, token);
      if (household.status !== 200 || routine.status !== 200) throw new Error(`Test setup failed: HTTP ${household.status}/${routine.status}`);
      return routine.body;
    },
    async put(path: string, body: unknown, token?: string) {
      const req = request(server).put(path);
      if (token !== undefined) req.set("Authorization", `Bearer ${token}`);
      const res = await req.send(body as object);
      return { status: res.status, body: res.body as any };
    },
    /** Upload a photo as multipart form data, like the PWA does. */
    async upload(path: string, photo: Buffer = Buffer.from("fake-jpeg"), mimeType = "image/jpeg", token?: string, fields: Record<string, string> = {}) {
      const req = request(server).post(path);
      if (token !== undefined) req.set("Authorization", `Bearer ${token}`);
      for (const [name, value] of Object.entries(fields)) req.field(name, value);
      const res = await req.attach("photo", photo, { filename: "photo.jpg", contentType: mimeType });
      return { status: res.status, body: res.body as any, headers: res.headers };
    },
    async get(path: string, token?: string) {
      const req = request(server).get(path);
      if (token !== undefined) req.set("Authorization", `Bearer ${token}`);
      const res = await req;
      return { status: res.status, body: res.body as any };
    },
  };
}
