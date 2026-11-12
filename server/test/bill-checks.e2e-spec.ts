import { describe, expect, it } from "vitest";
import { harness, schedule, testLogins } from "./utils/test-harness.js";
import type { Bill } from "../src/domain/bill.js";

const sched202601 = schedule("2026-01", 10.0, 50.0); // perKwh: generation rate=6.0, distribution rate=4.0; fixed supply_fixed=50.0
const sched202512 = schedule("2025-12", 10.0, 50.0);

describe("POST /api/bills/check", () => {
  describe("Check 1: Lines sum to total", () => {
    it("passes when charge lines sum equals totalAmount exactly", async () => {
      const api = await harness({ schedules: [sched202601] });
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        totalAmount: 1050,
        chargeLines: [
          { label: "Generation", amount: 600 },
          { label: "Distribution", amount: 400 },
          { label: "Supply (per customer)", amount: 50 },
        ],
      };

      const { status, body } = await api.post("/api/bills/check", { now });
      expect(status).toBe(200);
      const check = body.checks.find((c: any) => c.key === "lineSum");
      expect(check.status).toBe("pass");
    });

    it("passes when discrepancy is within tolerance of a few pesos", async () => {
      const api = await harness({ schedules: [sched202601] });
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        totalAmount: 1051.5, // 1.50 pesos difference (within 2 pesos tolerance)
        chargeLines: [
          { label: "Generation", amount: 600 },
          { label: "Distribution", amount: 400 },
          { label: "Supply (per customer)", amount: 50 },
        ],
      };

      const { status, body } = await api.post("/api/bills/check", { now, tolerancePesos: 2.0 });
      expect(status).toBe(200);
      const check = body.checks.find((c: any) => c.key === "lineSum");
      expect(check.status).toBe("pass");
    });

    it("fails when difference exceeds tolerance, results in red, and names two Meralco figures", async () => {
      const api = await harness({ schedules: [sched202601] });
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        totalAmount: 1200, // Discrepancy of 150 pesos
        chargeLines: [
          { label: "Generation", amount: 600 },
          { label: "Distribution", amount: 400 },
          { label: "Supply (per customer)", amount: 50 },
        ],
      };

      const { status, body } = await api.post("/api/bills/check", { now });
      expect(status).toBe(200);
      expect(body.overall).toBe("red");
      const check = body.checks.find((c: any) => c.key === "lineSum");
      expect(check.status).toBe("fail");
      expect(check.discrepancy).toBeDefined();
      expect(check.discrepancy.labelA).toBe("Kabuuan ng Charge Lines sa Bill");
      expect(check.discrepancy.valueA).toBe("₱1050.00");
      expect(check.discrepancy.labelB).toBe("Naka-print na Total Amount sa Bill");
      expect(check.discrepancy.valueB).toBe("₱1200.00");
      expect(body.summary).toContain("Kabuuan ng Charge Lines sa Bill: ₱1050.00");
      expect(body.summary).toContain("Naka-print na Total Amount sa Bill: ₱1200.00");
    });
  });

  describe("Check 2: Reading continuity (Previous = Last Bill's Present Reading)", () => {
    it("passes when current previousReading matches last bill presentReading", async () => {
      const api = await harness({ schedules: [sched202512, sched202601] });
      const before: Bill = {
        period: "2025-12",
        kwh: 100,
        billingDays: 30,
        previousReading: 1000,
        presentReading: 1100,
      };
      const now: Bill = {
        period: "2026-01",
        kwh: 150,
        billingDays: 30,
        previousReading: 1100,
        presentReading: 1250,
      };

      const { status, body } = await api.post("/api/bills/check", { now, before });
      expect(status).toBe(200);
      const check = body.checks.find((c: any) => c.key === "readingContinuity");
      expect(check.status).toBe("pass");
    });

    it("fails when readings do not match, results in red, and names two Meralco figures", async () => {
      const api = await harness({ schedules: [sched202512, sched202601] });
      const before: Bill = {
        period: "2025-12",
        kwh: 100,
        billingDays: 30,
        previousReading: 1000,
        presentReading: 1100,
      };
      const now: Bill = {
        period: "2026-01",
        kwh: 150,
        billingDays: 30,
        previousReading: 1150, // Mismatch: 1150 vs 1100
        presentReading: 1300,
      };

      const { status, body } = await api.post("/api/bills/check", { now, before });
      expect(status).toBe(200);
      expect(body.overall).toBe("red");
      const check = body.checks.find((c: any) => c.key === "readingContinuity");
      expect(check.status).toBe("fail");
      expect(check.discrepancy.labelA).toBe("Previous reading sa kasalukuyang Bill");
      expect(check.discrepancy.valueA).toBe(1150);
      expect(check.discrepancy.labelB).toBe("Present reading sa nakaraang Bill");
      expect(check.discrepancy.valueB).toBe(1100);
    });

    it("skips continuity check across a meter serial change", async () => {
      const api = await harness({ schedules: [sched202512, sched202601] });
      const before: Bill = {
        period: "2025-12",
        kwh: 100,
        billingDays: 30,
        meterSerialNumber: "MTR-001",
        presentReading: 1100,
      };
      const now: Bill = {
        period: "2026-01",
        kwh: 150,
        billingDays: 30,
        meterSerialNumber: "MTR-002", // Changed meter
        previousReading: 50, // New meter starts at 50
        presentReading: 200,
      };

      const { status, body } = await api.post("/api/bills/check", { now, before });
      expect(status).toBe(200);
      const check = body.checks.find((c: any) => c.key === "readingContinuity");
      expect(check.status).toBe("skipped");
      expect(check.message).toContain("Nagpalit ng metro");
    });

    it("skips continuity check across a missing Bill (non-consecutive periods)", async () => {
      const api = await harness({ schedules: [sched202512, sched202601] });
      const before: Bill = {
        period: "2025-10", // Gap: Oct 2025 to Jan 2026
        kwh: 100,
        billingDays: 30,
        presentReading: 1100,
      };
      const now: Bill = {
        period: "2026-01",
        kwh: 150,
        billingDays: 30,
        previousReading: 1300,
        presentReading: 1450,
      };

      const { status, body } = await api.post("/api/bills/check", { now, before });
      expect(status).toBe(200);
      const check = body.checks.find((c: any) => c.key === "readingContinuity");
      expect(check.status).toBe("skipped");
      expect(check.message).toContain("missing Bill");
    });
  });

  describe("Check 3: Per-kWh rates = published Rate Schedule", () => {
    it("passes when printed rates match published rate schedule", async () => {
      const api = await harness({ schedules: [sched202601] });
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        chargeLines: [
          { label: "Generation", amount: 600, rate: 6.0 },
          { label: "Distribution", amount: 400, rate: 4.0 },
        ],
      };

      const { status, body } = await api.post("/api/bills/check", { now });
      expect(status).toBe(200);
      const check = body.checks.find((c: any) => c.key === "rateSchedule");
      expect(check.status).toBe("pass");
    });

    it("fails when a per-kWh rate disagrees with published rate schedule", async () => {
      const api = await harness({ schedules: [sched202601] });
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        chargeLines: [
          { label: "Generation", amount: 750, rate: 7.5 }, // Sched rate is 6.0
          { label: "Distribution", amount: 400, rate: 4.0 },
        ],
      };

      const { status, body } = await api.post("/api/bills/check", { now });
      expect(status).toBe(200);
      expect(body.overall).toBe("red");
      const check = body.checks.find((c: any) => c.key === "rateSchedule");
      expect(check.status).toBe("fail");
      expect(check.discrepancy.labelA).toContain("Rate sa Bill");
      expect(check.discrepancy.valueA).toContain("7.5000");
      expect(check.discrepancy.labelB).toContain("Published Rate Schedule");
      expect(check.discrepancy.valueB).toContain("6.0000");
    });
  });

  describe("Check 4: Payment reflection (payments before bill date)", () => {
    it("passes when payment before bill date is credited on the bill", async () => {
      const api = await harness({ schedules: [sched202601] });
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        billDate: "2026-01-15",
        paymentsCredited: 2000,
        payments: [{ date: "2026-01-10", amount: 2000 }],
      };

      const { status, body } = await api.post("/api/bills/check", { now });
      expect(status).toBe(200);
      const check = body.checks.find((c: any) => c.key === "paymentReflection");
      expect(check.status).toBe("pass");
      expect(check.message).toContain("2000.00");
    });

    it("respects payment date vs bill date: payment made AFTER bill date is not expected to reflect", async () => {
      const api = await harness({ schedules: [sched202601] });
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        billDate: "2026-01-15",
        paymentsCredited: 0, // No payment reflected
        payments: [{ date: "2026-01-18", amount: 2000 }], // Paid 3 days AFTER bill was issued
      };

      const { status, body } = await api.post("/api/bills/check", { now });
      expect(status).toBe(200);
      const check = body.checks.find((c: any) => c.key === "paymentReflection");
      expect(check.status).toBe("pass");
      expect(check.message).toContain("Walang naitalang bayad bago o sa araw ng bill date");
    });

    it("fails when payment before bill date was not reflected, results in red, and names two Meralco figures", async () => {
      const api = await harness({ schedules: [sched202601] });
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        billDate: "2026-01-15",
        paymentsCredited: 0, // Paid 2500 on Jan 5 but 0 credited
        payments: [{ date: "2026-01-05", amount: 2500 }],
      };

      const { status, body } = await api.post("/api/bills/check", { now });
      expect(status).toBe(200);
      expect(body.overall).toBe("red");
      const check = body.checks.find((c: any) => c.key === "paymentReflection");
      expect(check.status).toBe("fail");
      expect(check.discrepancy.labelA).toContain("Naitalang bayad bago ang bill date");
      expect(check.discrepancy.valueA).toBe("₱2500.00");
      expect(check.discrepancy.labelB).toBe("Naka-reflect na bayad sa Bill");
      expect(check.discrepancy.valueB).toBe("₱0.00");
      expect(body.summary).toContain("Naitalang bayad bago ang bill date");
      expect(body.summary).toContain("₱2500.00");
    });
  });

  describe("Overall Green and Red handling", () => {
    it("returns overall green when all checks pass", async () => {
      const api = await harness({ schedules: [sched202512, sched202601] });
      const before: Bill = {
        period: "2025-12",
        kwh: 100,
        billingDays: 30,
        previousReading: 1000,
        presentReading: 1100,
      };
      const now: Bill = {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        billDate: "2026-01-15",
        totalAmount: 1050,
        previousReading: 1100,
        presentReading: 1200,
        paymentsCredited: 500,
        payments: [{ date: "2026-01-10", amount: 500 }],
        chargeLines: [
          { label: "Generation", amount: 600, rate: 6.0 },
          { label: "Distribution", amount: 400, rate: 4.0 },
          { label: "Supply (per customer)", amount: 50 },
        ],
      };

      const { status, body } = await api.post("/api/bills/check", { now, before });
      expect(status).toBe(200);
      expect(body.overall).toBe("green");
      expect(body.failedChecks).toHaveLength(0);
      expect(body.summary).toContain("Lahat ng nasuring Meralco figures ay nagtutugma");
    });
  });
});

describe("GET /api/households/:sin/check", () => {
  it("runs checks on a logged-in household's latest bill", async () => {
    const sin = testLogins[0].households[0].sin;
    const bills: Bill[] = [
      {
        period: "2025-12",
        kwh: 100,
        billingDays: 30,
        previousReading: 1000,
        presentReading: 1100,
      },
      {
        period: "2026-01",
        kwh: 100,
        billingDays: 30,
        totalAmount: 1050,
        previousReading: 1100,
        presentReading: 1200,
        chargeLines: [
          { label: "Generation", amount: 600, rate: 6.0 },
          { label: "Distribution", amount: 400, rate: 4.0 },
          { label: "Supply (per customer)", amount: 50 },
        ],
      },
    ];

    const api = await harness({
      schedules: [sched202512, sched202601],
      bills: { [sin]: bills },
    });

    const loginRes = await api.post("/api/auth/login", {
      email: testLogins[0].email,
      password: testLogins[0].password,
    });
    const token = loginRes.body.token;

    const { status, body } = await api.get(`/api/households/${sin}/check`, token);
    expect(status).toBe(200);
    expect(body.overall).toBe("green");
    expect(body.checks).toHaveLength(4);
  });

  it("returns 401 when missing bearer token", async () => {
    const api = await harness();
    const { status } = await api.get("/api/households/1234567890/check");
    expect(status).toBe(401);
  });
});
