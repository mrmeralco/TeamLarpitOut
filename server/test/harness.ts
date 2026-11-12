/**
 * API-level test harness. Tests talk only to the HTTP API; every external
 * source (Rate Schedules, Bill sources, later Meralco/smart meter/weather) is
 * injected here, so later tickets add a fake rather than a new seam.
 */
import { createApp, type Deps } from "../src/app.js";
import type { Bill } from "../src/domain/bill.js";
import { rateScheduleTable, type RateSchedule } from "../src/domain/rateSchedule.js";
import { inMemoryBillSource, type BillSource } from "../src/sources/billSource.js";

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

export function harness(opts: HarnessOptions = {}) {
  const deps: Deps = {
    rateSchedules: rateScheduleTable(
      opts.schedules ?? [schedule("2026-09", 10), schedule("2026-10", 11)],
    ),
    billSource: opts.billSource ?? inMemoryBillSource(opts.bills ?? {}),
  };
  const app = createApp(deps);

  return {
    app,
    async post(path: string, body: unknown) {
      const res = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as any };
    },
    async get(path: string) {
      const res = await app.request(path);
      return { status: res.status, body: (await res.json()) as any };
    },
  };
}
