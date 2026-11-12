import { describe, expect, it } from "vitest";
import type { RawBillReading, VisionProvider } from "../src/vision/vision-provider.interface.js";
import { bill, harness, testAccounts } from "./utils/test-harness.js";

const A = testAccounts[0]!; // CAN 1000000001 → SIN 1234567890, traditional
const SMART = testAccounts[1]!; // CAN 1000000002 → SIN 9876543210, smart
const twelve = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 8 + i, 1));
  return bill(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, 200 + i, 30, [{ label: "Generation", amount: 1234.56 }]);
});
const reading = (can: string | null): RawBillReading => ({
  readable: true, customerAccountNumber: can, serviceIdNumber: null, period: "2026-10", kwh: 213, billingDays: 30,
});
/** Vision that reads whatever CAN the test sets next. */
function switchableVision(initial: string | null = A.can) {
  let can = initial;
  const provider: VisionProvider = {
    async readBill() { return reading(can); },
    async readEnergyLabel() { return { readable: false }; },
  };
  return Object.assign(provider, { set(next: string | null) { can = next; } });
}
const NEW = "new-person@example.test";
const PER_HOUSEHOLD = (sin: string) => [
  `/api/households/${sin}/bills`, `/api/households/${sin}/bakit-ganito`, `/api/households/${sin}/check`,
  `/api/households/${sin}/home`, `/api/households/${sin}/appliances`, `/api/households/${sin}/target`,
  `/api/households/${sin}/points`, `/api/households/${sin}/rewards`, `/api/households/${sin}/changes`,
];

async function scanned(vision = switchableVision(), links: Record<string, string[]> = {}) {
  const api = await harness({ links, bills: { [A.sin]: twelve, [SMART.sin]: twelve }, vision });
  const token = await api.login(NEW);
  const scan = await api.upload("/api/bills/scan", undefined, undefined, token);
  return { api, token, scan };
}

describe("Account Linking from the scanned Bill (no CAN screen)", () => {
  it("the scan reads the CAN and shows only a masked summary; nothing is linked yet", async () => {
    const { api, token, scan } = await scanned();
    expect(scan.status).toBe(200);
    expect(scan.body.canMasked).toBe("10•• ••• 001");
    expect(scan.body.account).toEqual({
      status: "found", canMasked: "10•• ••• 001", area: "City A", meterType: "traditional",
      billsOnRecord: 12, firstPeriod: "2025-11", lastPeriod: "2026-10",
    });
    expect(JSON.stringify(scan.body.account)).not.toMatch(/1234\.56|1000000001|1234567890/);
    expect((await api.get("/api/households", token)).body).toEqual([]);
    for (const path of PER_HOUSEHOLD(A.sin)) expect([path, (await api.get(path, token)).status]).toEqual([path, 404]);
  });

  it("'Yes, explain my bill' links the scanned CAN and unlocks the 12-bill history", async () => {
    const { api, token, scan } = await scanned();
    const linked = await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken }, token);
    expect(linked.body).toEqual({ status: "active", householdSin: A.sin, canMasked: "10•• ••• 001" });
    expect((await api.get(`/api/households/${A.sin}/bills`, token)).body).toHaveLength(12);
    expect((await api.get("/api/households", token)).body).toEqual([{ sin: A.sin, masked_address: "••• City A", meter_type: "traditional" }]);
  });

  it("asks for the CAN from the Bill only when the scan could not read it", async () => {
    const { api, token, scan } = await scanned(switchableVision(null));
    expect(scan.body.canMasked).toBeNull();
    expect(scan.body.account).toEqual({ status: "canUnread" });
    const scanToken = scan.body.scanToken;
    expect((await api.post("/api/households/link/confirm", { scanToken }, token)).body.reason).toBe("canRequired");
    expect((await api.post("/api/households/link/confirm", { scanToken, can: "1000-000-001" }, token)).body.status).toBe("active");
  });

  it("a typed CAN cannot override one the scan did read", async () => {
    const { api, token, scan } = await scanned(switchableVision(SMART.can));
    const linked = await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken, can: A.can }, token);
    expect(linked.body.householdSin).toBe(SMART.sin);
    expect((await api.get(`/api/households/${A.sin}/bills`, token)).status).toBe(404);
  });

  it("an unknown CAN says so and links nothing", async () => {
    const { api, token, scan } = await scanned(switchableVision("9999999999"));
    expect(scan.body.account).toEqual({ status: "unknownAccount", canMasked: "99•• ••• 999" });
    expect((await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken }, token)).status).toBe(404);
  });

  it("a CAN already linked to another login can be linked by this login too", async () => {
    const { api, token, scan } = await scanned(switchableVision(), { "owner@example.test": [A.sin] });
    expect(scan.body.account).toMatchObject({ status: "found", canMasked: "10•• ••• 001" });
    const res = await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken }, token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "active", householdSin: A.sin });
    expect((await api.get(`/api/households/${A.sin}/bills`, token)).status).toBe(200);
  });

  it("a Bill already linked to this login is reported as such", async () => {
    const { scan } = await scanned(switchableVision(), { [NEW]: [A.sin] });
    expect(scan.body.account).toMatchObject({ status: "alreadyLinked", householdSin: A.sin });
  });

  it("smart meter Households follow the same rule: readings load only after confirming", async () => {
    const { api, token, scan } = await scanned(switchableVision(SMART.can));
    expect(scan.body.account.meterType).toBe("smart");
    expect((await api.get(`/api/households/${SMART.sin}/readings?interval=day`, token)).status).toBe(404);
    await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken }, token);
    expect((await api.get(`/api/households/${SMART.sin}/readings?interval=day`, token)).status).toBe(200);
  });

  it("linking needs a session and a valid scan reference; the old typed-CAN endpoint is gone", async () => {
    const { api, token, scan } = await scanned();
    expect((await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken })).status).toBe(401);
    expect((await api.post("/api/households/link/confirm", { scanToken: "a".repeat(43) }, token)).status).toBe(404);
    expect((await api.post("/api/households/link/confirm", { scanToken: "short" }, token)).status).toBe(400);
    expect((await api.post("/api/households/link", { can: A.can }, token)).status).toBe(404);
  });
});

describe("demo fallback (AUTH_FIXED_CODE set)", () => {
  it("an unknown CAN gets a demo Household: the scanned Bill is the latest Bill, sample months fill the rest", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("AUTH_FIXED_CODE", "123456");
    try {
      const vision = switchableVision("5512345678");
      const api = await harness({ links: {}, bills: { [A.sin]: twelve }, vision });
      const first = await api.login("first@example.test");
      const scan = await api.upload("/api/bills/scan", undefined, undefined, first);
      expect(scan.body.account).toMatchObject({ status: "found", demo: true, canMasked: "55•• ••• 678", area: "City A", billsOnRecord: 12 });
      // The kWh corrected on "Does this look right?" is what gets explained.
      const linked = await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken, kwh: 250 }, first);
      expect(linked.body).toMatchObject({ status: "active", householdSin: "8512345678", demo: true });
      const sin = linked.body.householdSin;
      const history = (await api.get(`/api/households/${sin}/bills`, first)).body;
      expect(history).toHaveLength(12);
      expect(history.at(-1)).toMatchObject({ period: "2026-10", kwh: 250, billingDays: 30, provenance: { kind: "scanned" } });
      expect(history[0].period).toBe("2025-11");
      expect((await api.get(`/api/households/${sin}/home`, first)).body.bill.period).toBe("2026-10");
      // The sample Household itself is untouched.
      expect((await api.get(`/api/households`, first)).body.map((h: { sin: string }) => h.sin)).toEqual([sin]);

      // Another login scanning the same Bill shares the demo Household.
      const second = await api.login("second@example.test");
      const again = await api.upload("/api/bills/scan", undefined, undefined, second);
      expect(again.body.account).toMatchObject({ status: "found", demo: true });
      expect((await api.post("/api/households/link/confirm", { scanToken: again.body.scanToken }, second)).body.householdSin).toBe(sin);
      expect((await api.get(`/api/households/${sin}/bills`, second)).status).toBe(200);

      // Re-confirming as the first login keeps the same Household and rebuilds it from the new scan.
      const rescan = await api.upload("/api/bills/scan", undefined, undefined, first);
      expect(rescan.body.account).toMatchObject({ status: "alreadyLinked", householdSin: sin, demo: true });
      await api.post("/api/households/link/confirm", { scanToken: rescan.body.scanToken }, first);
      expect((await api.get(`/api/households/${sin}/bills`, first)).body.at(-1).kwh).toBe(213);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("corrections are validated", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("AUTH_FIXED_CODE", "123456");
    try {
      const api = await harness({ links: {}, bills: { [A.sin]: twelve }, vision: switchableVision("5512345678") });
      const token = await api.login(NEW);
      const scan = await api.upload("/api/bills/scan", undefined, undefined, token);
      for (const bad of [{ kwh: -1 }, { billingDays: 0 }, { billingDays: 2.5 }, { totalAmount: "lots" }]) {
        expect((await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken, ...bad }, token)).status).toBe(400);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("without demo mode an unknown CAN still says 'Account not found'", async () => {
    const { api, token, scan } = await scanned(switchableVision("5512345678"));
    expect(scan.body.account.status).toBe("unknownAccount");
    expect((await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken }, token)).status).toBe(404);
  });
});
