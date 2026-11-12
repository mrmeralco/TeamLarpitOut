import { describe, expect, it } from "vitest";
import type { Sql } from "../src/database/database.module.js";
import { PgMeralcoSource } from "../src/database/pg-meralco.source.js";

/** A stand-in for postgres.js: answers by the table each query reads, and counts the queries. */
function fakeSql(opts: { fail?: boolean; demoBills?: unknown[] } = {}) {
  const calls: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join("?");
    calls.push(text);
    if (opts.fail) return Promise.reject(new Error("connection lost"));
    if (text.includes("from meralco.accounts")) return Promise.resolve([{ lifeline_eligible: false }]);
    if (text.includes("from meralco.payments")) return Promise.resolve([]);
    if (text.includes("from meralco.demo_histories")) return Promise.resolve(opts.demoBills ? [{ bills: opts.demoBills }] : []);
    return Promise.resolve([{
      period: "2026-09", period_start: "2026-08-15", period_end: "2026-09-14", billing_days: 31, bill_date: "2026-09-15", due_date: "2026-09-25",
      meter_number: "M1", previous_reading: 100, present_reading: 373, multiplier: 1, kwh: 273, estimated: false,
      total: 412300, previous_balance: 0, payments_credited: null, provenance: "seed", provenance_note: null, lines: [],
    }]);
  }) as unknown as Sql;
  return { sql, calls };
}

describe("PgMeralcoSource.bills", () => {
  it("runs one load's queries together and reuses the result while it is fresh", async () => {
    let now = 0;
    const { sql, calls } = fakeSql();
    const source = new PgMeralcoSource(sql, 60_000, () => now);
    const [a, b] = await Promise.all([source.bills("123"), source.bills("123")]);
    expect(calls).toHaveLength(4);
    expect(a).toBe(b);
    expect(a.map((bill) => bill.period)).toEqual(["2026-09"]);
    now = 59_000;
    await source.bills("123");
    expect(calls).toHaveLength(4);
    now = 61_000;
    await source.bills("123");
    expect(calls).toHaveLength(8);
  });

  it("does not keep a failed load", async () => {
    const failing = fakeSql({ fail: true });
    const source = new PgMeralcoSource(failing.sql, 60_000, () => 0);
    await expect(source.bills("123")).rejects.toThrow("connection lost");
    await expect(source.bills("123")).rejects.toThrow("connection lost");
    expect(failing.calls).toHaveLength(8);
  });

  it("serves a demo Household's stored History, oldest first", async () => {
    const { sql } = fakeSql({ demoBills: [{ period: "2026-10", kwh: 300, billingDays: 30 }, { period: "2026-09", kwh: 273, billingDays: 31 }] });
    const source = new PgMeralcoSource(sql, 60_000, () => 0);
    expect((await source.bills("8485721936")).map((b) => b.period)).toEqual(["2026-09", "2026-10"]);
  });
});

describe("PgMeralcoSource demo Households", () => {
  it("marks demo accounts and drops a cached History when it is replaced", async () => {
    const calls: string[] = [];
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("?");
      calls.push(text);
      if (text.includes("select can, sin")) return Promise.resolve([{ can: "0485721936", sin: "8485721936", area: "Caloocan City", meter_type: "traditional", demo: true }]);
      if (text.includes("from meralco.accounts")) return Promise.resolve([{ lifeline_eligible: false }]);
      return Promise.resolve([]);
    }) as unknown as Sql;
    (sql as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
    const source = new PgMeralcoSource(sql, 60_000, () => 0);
    expect(await source.findByCan("0485721936")).toEqual({ can: "0485721936", sin: "8485721936", area: "Caloocan City", meter_type: "traditional", demo: true });
    await source.bills("8485721936");
    const before = calls.length;
    await source.setBills("8485721936", []);
    expect(calls.at(-1)).toContain("and demo");
    await source.bills("8485721936");
    expect(calls).toHaveLength(before + 1 + 4);
  });
});
