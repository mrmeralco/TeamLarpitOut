import { describe, expect, it } from "vitest";
import table from "../src/data/rate-schedules.json" with { type: "json" };
import type { RateSchedule } from "../src/domain/rate-schedule.js";
import { bill, harness, schedule } from "./utils/test-harness.js";

const effectsSum = (body: any) => body.effects.reduce((s: number, e: any) => s + e.amount, 0);
const linesSum = (body: any) => body.lines.reduce((s: number, l: any) => s + l.amount, 0);
const effect = (body: any, key: string) => body.effects.find((e: any) => e.key === key).amount;
const line = (body: any, key: string) => body.lines.find((l: any) => l.key === key);

// Harness schedules: Sept ₱10/kWh, Oct ₱11/kWh, ₱50 fixed; lifeline 50% ≤ 50 kWh, 20% ≤ 100 kWh.
const eligible = { lifelineEligible: true };

describe("lifeline line", () => {
  it("shows the discount gained when usage drops under the threshold, and still reconciles", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bakit-ganito", {
      before: { ...bill("2026-09", 150, 30), ...eligible }, // ₱1,550, no discount
      now: { ...bill("2026-10", 90, 30), ...eligible }, //     ₱1,040 − 20% × ₱990 = ₱842
    });

    expect(body.now.rebuiltTotal).toBe(84_200);
    expect(body.total).toBe(-70_800);
    expect(line(body, "lifeline")).toEqual({ key: "lifeline", label: "Lifeline discount", amount: -19_800, status: "gained" });
    expect(effect(body, "rate")).toBe(9_000);
    expect(effect(body, "habit")).toBe(-60_000);
    expect(effectsSum(body) + linesSum(body)).toBe(body.total);
    expect(body.now.lines.at(-1)).toEqual({ code: "lifeline", label: "Lifeline Discount", kind: "perKwh", amount: -19_800 });
  });

  it("shows the discount lost when usage crosses above the threshold", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bakit-ganito", {
      before: { ...bill("2026-09", 40, 30), ...eligible }, // ₱450 − 50% × ₱400 = ₱250
      now: { ...bill("2026-10", 120, 30), ...eligible }, //  ₱1,370, no discount
    });
    expect(line(body, "lifeline")).toMatchObject({ amount: 20_000, status: "lost" });
    expect(body.total).toBe(112_000);
    expect(effectsSum(body) + linesSum(body)).toBe(body.total);
  });

  it("is absent for a household not registered for lifeline, even under the threshold", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-09", 150, 30),
      now: bill("2026-10", 40, 30),
    });
    expect(body.lines).toEqual([]);
    expect(effectsSum(body)).toBe(body.total);
  });

  it("is absent when neither Bill gets a discount", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bakit-ganito", {
      before: { ...bill("2026-09", 150, 30), ...eligible },
      now: { ...bill("2026-10", 180, 30), ...eligible },
    });
    expect(body.lines).toEqual([]);
  });
});

describe("catch-up line", () => {
  it("separates last month's under-estimate from this month's usage (estimated then actual)", async () => {
    const api = await harness({ schedules: [schedule("2026-09", 10), schedule("2026-10", 10)] });
    const { body } = await api.userPost("/api/bakit-ganito", {
      before: { ...bill("2026-09", 150, 30), estimated: true }, // estimated low
      now: bill("2026-10", 250, 30), //                           actual reading catches up
    });

    // 400 kWh over 60 days → 200 + 200. 50 kWh of this Bill belong to September.
    expect(line(body, "catchUp")).toEqual({
      key: "catchUp",
      label: "Catch-up from an estimated Bill",
      amount: 100_000,
      kwh: 50,
    });
    expect(effect(body, "habit")).toBe(0);
    expect(body.habitMeasurable).toBe(false);
    expect(body.total).toBe(100_000);
    expect(effectsSum(body) + linesSum(body)).toBe(body.total);
  });

  it("is negative when last month was over-estimated", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bakit-ganito", {
      before: { ...bill("2026-09", 300, 30), estimated: true },
      now: bill("2026-10", 160, 32),
    });
    expect(line(body, "catchUp").amount).toBeLessThan(0);
    expect(line(body, "catchUp").kwh).toBeLessThan(0);
    expect(effectsSum(body) + linesSum(body)).toBe(body.total);
  });

  it("does not apply when this Bill is the estimated one, or neither is", async () => {
    const api = await harness();
    for (const [b, n] of [
      [bill("2026-09", 200, 30), { ...bill("2026-10", 240, 32), estimated: true }],
      [bill("2026-09", 200, 30), bill("2026-10", 240, 32)],
    ]) {
      const { body } = await api.userPost("/api/bakit-ganito", { before: b, now: n });
      expect(body.lines).toEqual([]);
      expect(body.habitMeasurable).toBe(true);
    }
  });

  it("combines with lifeline and still reconciles exactly on the real Rate Schedule table", async () => {
    const api = await harness({ schedules: table.schedules as RateSchedule[] });
    for (const [kb, kn] of [
      [45, 130],
      [130, 45],
      [18, 64.5],
      [88.8, 101],
    ]) {
      const { body } = await api.userPost("/api/bakit-ganito", {
        before: { ...bill("2026-09", kb!, 29), estimated: true, ...eligible },
        now: { ...bill("2026-10", kn!, 33), ...eligible },
      });
      expect(body.lines.map((l: any) => l.key)).toContain("catchUp");
      expect(effectsSum(body) + linesSum(body)).toBe(body.total);
      expect(body.total).toBe(body.now.rebuiltTotal - body.before.rebuiltTotal);
    }
  });
});

describe("credits, refunds, adjustments and prior balances", () => {
  const charges = (gen: number, dist: number) => [
    { label: "Generation", amount: gen },
    { label: "Distribution", amount: dist },
    { label: "Supply", amount: 50 },
  ];

  it("are listed separately and never change the four effects", async () => {
    const api = await harness();
    const plain = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-09", 200, 30, charges(1200, 800)),
      now: bill("2026-10", 240, 32, charges(1584, 1056)),
    });
    const withExtras = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-09", 200, 30, [...charges(1200, 800), { label: "Bill Deposit Refund", amount: -100 }]),
      now: bill("2026-10", 240, 32, [
        ...charges(1584, 1056),
        { label: "Previous Balance", amount: 500 },
        { label: "Power Act Reduction Adjustment", amount: -12.5 },
        { label: "Senior Citizen Credit", amount: -20 },
      ]),
    });

    const body = withExtras.body;
    expect(body.effects).toEqual(plain.body.effects);
    expect(body.total).toBe(plain.body.total);
    expect(body.now.extras.map((e: any) => [e.label, e.kind, e.amount])).toEqual([
      ["Previous Balance", "priorBalance", 50_000],
      ["Power Act Reduction Adjustment", "adjustment", -1_250],
      ["Senior Citizen Credit", "credit", -2_000],
    ]);
    expect(body.before.extras.map((e: any) => e.kind)).toEqual(["refund"]);
    expect(body.extrasChange).toBe(46_750 + 10_000);
  });

  it("reconcile with the effects to the real printed change", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-09", 200, 30, charges(1200, 800)),
      now: bill("2026-10", 240, 32, [...charges(1584, 1056), { label: "Previous Balance", amount: 500 }]),
    });
    expect(body.printedChange).toBe(64_000 + 50_000);
    expect(effectsSum(body) + linesSum(body) + body.extrasChange).toBe(body.printedChange);
    expect(body.unexplained).toBe(0);
  });

  it("leave nothing extra when there are none (lines appear only when they apply)", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bakit-ganito", {
      before: bill("2026-09", 200, 30),
      now: bill("2026-10", 240, 32),
    });
    expect(body.lines).toEqual([]);
    expect(body.now.extras).toEqual([]);
    expect(body.extrasChange).toBe(0);
    expect(body.unexplained).toBeNull();
  });
});
