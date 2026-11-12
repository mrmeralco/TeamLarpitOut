import { describe, expect, it } from "vitest";
import { demoAccounts, demoLinks, DEMO_LOGINS, DEMO_PASSWORD } from "../src/auth/demo-logins.js";
import { ownerIdForEmail } from "../src/auth/auth.service.js";
import { verifyPassword } from "../src/auth/password.js";
import { recordFromBill, scheduleLines, toBill } from "../src/bills/meralco-records.js";
import { realBillHousehold } from "../src/bills/real-bill-household.js";
import { buildBillBreakdown } from "../src/domain/bill-breakdown.js";
import { cost, type RateSchedule } from "../src/domain/rate-schedule.js";
import table from "../src/data/rate-schedules.json" with { type: "json" };
import seed from "../src/data/meralco-real-bill-seed.json" with { type: "json" };

const schedules = new Map((table.schedules as RateSchedule[]).map((s) => [s.period, s]));
const household = realBillHousehold({});
const realBill = household.bills.at(-1)!;
const cents = (pesos: number) => Math.round(pesos * 100);

describe("the real-Bill Household (one real September 2026 Bill)", () => {
  it("keeps the real Bill exactly as printed: lines add up to each group and to the total", () => {
    expect(realBill).toMatchObject({ period: "2026-09", kwh: 273, billingDays: 31, total: 412263, provenance: { kind: "real" } });
    for (const g of realBill.groups) {
      expect([g.groupCode, realBill.lines.filter((l) => l.groupCode === g.groupCode).reduce((s, l) => s + l.amount, 0)]).toEqual([g.groupCode, g.amount]);
    }
    expect(realBill.groups.reduce((s, g) => s + g.amount, 0)).toBe(412263);
  });

  it("stores no real identifiers: the committed record uses placeholders and the area only", () => {
    expect(household.account).toEqual({
      can: "0900000273", sin: "090000027300", holderName: "Test Household (real Bill, placeholder name)",
      area: "Caloocan City", meter_type: "traditional", meterNumber: "DEMO0273", lifelineEligible: false,
    });
    expect(JSON.stringify(household)).not.toMatch(/address/i);
  });

  it("rebuilds the real Bill to the centavo with the September 2026 Rate Schedule", () => {
    expect(cost(273, 31, schedules.get("2026-09")!)).toBe(412263);
    expect(schedules.get("2026-09")!.perKwh.find((c) => c.code === "generation")!.rate).toBe(9.7032);
  });

  it("rebuilds May–August 2026 to exactly what was paid, and the 12 Bills' readings continue", () => {
    for (const month of seed.history.months.filter((m) => m.paidTotal !== undefined)) {
      const b = household.bills.find((x) => x.period === month.period)!;
      expect([month.period, b.total, cost(b.kwh, b.billingDays, schedules.get(b.period)!)]).toEqual([month.period, cents(month.paidTotal!), cents(month.paidTotal!)]);
    }
    expect(household.bills.map((b) => b.period)).toEqual([
      "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
    ]);
    for (const [i, b] of household.bills.entries()) {
      expect(b.presentReading! - b.previousReading!).toBe(b.kwh);
      if (i > 0) expect(b.previousReading).toBe(household.bills[i - 1]!.presentReading);
    }
  });

  it("gives the app Schedule-shaped lines that add up to the total, with the payment the Bill applied", () => {
    const bill = toBill(realBill, household.payments);
    expect(bill.chargeLines!.reduce((s, l) => s + cents(l.amount), 0)).toBe(412263);
    expect(bill.chargeLines!.find((l) => l.label === "Distribution Charge")!.amount).toBe(74.96); // net of the AWAT refunds
    expect(bill.payments).toEqual([{ date: "2026-09-15", amount: 4359.49 }]);
    expect(bill.paymentsCredited).toBe(4359.49);
    expect(toBill(household.bills[0]!, household.payments).payments).toBeUndefined();
  });

  it("round-trips the older Bill shape through a Meralco record", () => {
    const lines = [{ label: "Generation Charge", amount: 100.5 }, { label: "VAT (per customer lines)", amount: 2.57 }, { label: "Odd line", amount: 1 }];
    const record = recordFromBill({ period: "2026-10", kwh: 10, billingDays: 31, chargeLines: lines });
    expect(record.groups.map((g) => g.groupCode)).toEqual(["generation", "taxes", "other"]);
    expect(scheduleLines(record.lines)).toEqual(lines);
  });

  it("swaps in the real identifiers from a local seed, and rejects malformed ones", () => {
    const local = realBillHousehold({ realBill: { can: "1234567890", sin: "123456789012", meterNumber: "M1" } });
    expect(local.account).toMatchObject({ can: "1234567890", sin: "123456789012", meterNumber: "M1" });
    expect(local.bills.every((b) => b.meterNumber === "M1")).toBe(true);
    expect(() => realBillHousehold({ realBill: { can: "12345" } })).toThrow(/10-digit CAN/);
    expect(() => realBillHousehold({ realBill: { sin: "abc" } })).toThrow(/Service ID Number/);
  });
});

describe("test logins", () => {
  it("are verified accounts with the demo password; only the owner is linked", async () => {
    const accounts = await demoAccounts();
    expect(accounts.map((a) => a.email)).toEqual(DEMO_LOGINS.map((l) => l.email));
    for (const a of accounts) expect(a.phoneVerified && (await verifyPassword(DEMO_PASSWORD, a.passwordHash!))).toBe(true);
    expect(demoLinks({ can: "0900000273", sin: "090000027300" })).toEqual([
      { ownerId: ownerIdForEmail("bill-owner@example.com"), sin: "090000027300", can: "0900000273", status: "active" },
    ]);
    expect(demoLinks({ can: "0900000273", sin: "090000027300" }, false)).toEqual([]);
  });
});

describe("change vs last month when two lines share a charge type", () => {
  it("compares each VAT line with last month's VAT line of the same label, never the two combined", () => {
    const before = [{ label: "VAT (per kWh lines)", amount: 359.41 }, { label: "VAT (per customer lines)", amount: 2.57 }];
    const now = [{ label: "VAT (per kWh lines)", amount: 340.69 }, { label: "VAT (per customer lines)", amount: 2.57 }];
    const rows = buildBillBreakdown(now, before).groups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.change)).toEqual([
      { status: "changed", amount: -1872, previous: 35941 },
      { status: "changed", amount: 0, previous: 257 },
    ]);
  });
});
