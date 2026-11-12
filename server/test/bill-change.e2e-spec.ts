import { describe, expect, it } from "vitest";
import table from "../src/data/rate-schedules.json" with { type: "json" };
import type { RateSchedule } from "../src/domain/rate-schedule.js";
import { bill, harness, schedule } from "./utils/test-harness.js";

const sum = (effects: { amount: number }[]) => effects.reduce((s, e) => s + e.amount, 0);
const amount = (body: any, key: string) => body.effects.find((e: any) => e.key === key).amount;

describe("POST /api/bakit-ganito", () => {
  it("splits a higher Bill into effects that add up exactly to cost(now) − cost(before)", async () => {
    const api = await harness();
    const { status, body } = await api.post("/api/bakit-ganito", {
      before: bill("2026-09", 200, 30), // 200 × ₱10 + ₱50 = ₱2,050
      now: bill("2026-10", 240, 32), //   240 × ₱11 + ₱50 = ₱2,690
    });

    expect(status).toBe(200);
    expect(body.before.rebuiltTotal).toBe(205_000);
    expect(body.now.rebuiltTotal).toBe(269_000);
    expect(body.total).toBe(64_000);
    expect(amount(body, "rate")).toBe(24_000); // 240 kWh × ₱1 more
    expect(amount(body, "billingDays")).toBe(13_333); // 2 more days at 6.67 kWh/day
    expect(amount(body, "weather")).toBe(0); // no Heat Sensitivity yet
    expect(amount(body, "habit")).toBe(26_667);
    expect(sum(body.effects)).toBe(body.total);
  });

  it("includes Fixed Charges in the sum: a fixed-charge change lands in the Rate Effect", async () => {
    const api = await harness({ schedules: [schedule("2026-09", 10, 40), schedule("2026-10", 10, 65)] });
    const { body } = await api.post("/api/bakit-ganito", {
      before: bill("2026-09", 150, 30),
      now: bill("2026-10", 150, 30),
    });

    expect(body.total).toBe(2_500);
    expect(amount(body, "rate")).toBe(2_500);
    expect(amount(body, "billingDays")).toBe(0);
    expect(amount(body, "habit")).toBe(0);
    expect(sum(body.effects)).toBe(body.total);
  });

  it("shows negative effects when the Bill went down", async () => {
    const api = await harness({ schedules: [schedule("2026-10", 11), schedule("2026-11", 9.5)] });
    const { body } = await api.post("/api/bakit-ganito", {
      before: bill("2026-10", 300, 31),
      now: bill("2026-11", 250, 29),
    });

    expect(body.total).toBe(-92_500);
    expect(amount(body, "rate")).toBe(-37_500);
    expect(amount(body, "billingDays")).toBeLessThan(0);
    expect(amount(body, "habit")).toBeLessThan(0);
    expect(sum(body.effects)).toBe(body.total);
  });

  it("stays exact to the centavo with the real Rate Schedule table's decimals", async () => {
    const api = await harness({ schedules: table.schedules as RateSchedule[] });
    const periods = ["2026-09", "2026-10", "2026-11"];
    for (const [i, kwhBefore] of [87.3, 143, 199.9, 201, 412.75].entries()) {
      for (const kwhNow of [0, 55.5, 188, 333.33]) {
        const { body } = await api.post("/api/bakit-ganito", {
          before: bill(periods[i % 3]!, kwhBefore, 28 + (i % 5)),
          now: bill(periods[(i + 1) % 3]!, kwhNow, 33 - (i % 4)),
        });
        expect(sum(body.effects)).toBe(body.total);
        expect(body.total).toBe(body.now.rebuiltTotal - body.before.rebuiltTotal);
      }
    }
  });

  it("keeps Per-kWh and Fixed Charges as separate rebuilt lines", async () => {
    const api = await harness();
    const { body } = await api.post("/api/bakit-ganito", {
      before: bill("2026-09", 100, 30),
      now: bill("2026-10", 100, 30),
    });
    const kinds = body.now.lines.map((l: any) => [l.code, l.kind]);
    expect(kinds).toEqual([
      ["generation", "perKwh"],
      ["distribution", "perKwh"],
      ["supply_fixed", "fixed"],
    ]);
  });

  it("reports the change in printed totals when charge lines are typed", async () => {
    const api = await harness();
    const { body } = await api.post("/api/bakit-ganito", {
      before: bill("2026-09", 200, 30, [
        { label: "Generation", amount: 1200 },
        { label: "Distribution", amount: 800 },
        { label: "Supply", amount: 50 },
      ]),
      now: bill("2026-10", 240, 32, [
        { label: "Generation", amount: 1584 },
        { label: "Distribution", amount: 1056 },
        { label: "Supply", amount: 50 },
      ]),
    });
    expect(body.printedChange).toBe(64_000);
    expect(body.printedChange).toBe(body.total);
  });

  it("returns 422 when a Bill's month has no Rate Schedule", async () => {
    const api = await harness();
    const { status, body } = await api.post("/api/bakit-ganito", {
      before: bill("2025-01", 200, 30),
      now: bill("2026-10", 240, 32),
    });
    expect(status).toBe(422);
    expect(body.period).toBe("2025-01");
  });

  it("returns 400 for a malformed Bill", async () => {
    const api = await harness();
    const { status } = await api.post("/api/bakit-ganito", { before: { kwh: -1 }, now: {} });
    expect(status).toBe(400);
  });
});

describe("GET /api/households/:sin/bakit-ganito (injected Bill source)", () => {
  it("decodes the two latest Bills from a fake Bill source", async () => {
    const api = await harness({
      bills: {
        "1234567890": [bill("2026-10", 240, 32), bill("2026-09", 200, 30)],
      },
    });
    const { status, body } = await api.get("/api/households/1234567890/bakit-ganito", await api.login());
    expect(status).toBe(200);
    expect(body.before.period).toBe("2026-09");
    expect(body.total).toBe(64_000);
    expect(sum(body.effects)).toBe(body.total);
  });

  it("accepts a fully custom Bill source", async () => {
    const api = await harness({
      billSource: { bills: async () => [bill("2026-09", 100, 30), bill("2026-10", 100, 30)] },
    });
    const { body } = await api.get("/api/households/1234567890/bakit-ganito", await api.login());
    expect(amount(body, "habit")).toBe(0);
  });

  it("404s when the Household has fewer than two Bills", async () => {
    const api = await harness({ bills: { "1234567890": [bill("2026-10", 240, 32)] } });
    const { status, body } = await api.get("/api/households/1234567890/bakit-ganito", await api.login());
    expect(status).toBe(404);
    expect(body.error).toBe("Kailangan ng dalawang Bill");
  });
});
