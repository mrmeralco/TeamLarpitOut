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
import { BILL_SOURCE, RATE_SCHEDULES } from "../src/tokens.js";

/** A small, round-number schedule so expected pesos are easy to check by hand. */
export function schedule(period: string, perKwh: number, fixed = 50): RateSchedule {
  return {
    period,
    perKwh: [
      { code: "generation", label: "Generation", rate: perKwh * 0.6, passThrough: true },
      { code: "distribution", label: "Distribution", rate: perKwh * 0.4, passThrough: false },
    ],
    fixed: [{ code: "supply_fixed", label: "Supply (per customer)", amount: fixed }],
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
}

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
    async get(path: string) {
      const res = await request(server).get(path);
      return { status: res.status, body: res.body as any };
    },
  };
}
