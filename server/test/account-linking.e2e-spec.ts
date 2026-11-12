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
function switchableVision() {
  let can: string | null = A.can;
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

describe("Account Linking by CAN", () => {
  it("typing a CAN returns only a masked summary and a pending link", async () => {
    const api = await harness({ links: {}, bills: { [A.sin]: twelve } });
    const token = await api.login(NEW);
    const { status, body } = await api.post("/api/households/link", { can: "1000 000 001" }, token);
    expect(status).toBe(200);
    expect(body).toEqual({
      status: "pending", canMasked: "10•• ••• 001", area: "City A", meterType: "traditional",
      billsOnRecord: 12, firstPeriod: "2025-11", lastPeriod: "2026-10",
    });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/1234\.56|kwh|213|1000000001|1234567890/i);
    expect((await api.get("/api/households/link", token)).body).toEqual({ pending: body });
    expect((await api.get("/api/households", token)).body).toEqual([]);
  });

  it("every per-Household route returns 403 before a matching scan, then unlocks after it", async () => {
    const vision = switchableVision();
    const api = await harness({ links: {}, bills: { [A.sin]: twelve }, vision });
    const token = await api.login(NEW);
    await api.post("/api/households/link", { can: A.can }, token);
    for (const path of PER_HOUSEHOLD(A.sin)) {
      const res = await api.get(path, token);
      expect([path, res.status]).toEqual([path, 403]);
      expect(res.body.reason).toBe("pendingScan");
    }
    const scan = await api.upload("/api/bills/scan", undefined, undefined, token);
    expect(scan.status).toBe(200);
    expect(scan.body.canMasked).toBe("10•• ••• 001");
    expect(scan.body.link).toEqual({ status: "active", householdSin: A.sin, canMasked: "10•• ••• 001" });
    expect((await api.get(`/api/households/${A.sin}/bills`, token)).body).toHaveLength(12);
    expect((await api.get("/api/households", token)).body).toEqual([{ sin: A.sin, masked_address: "••• City A", meter_type: "traditional" }]);
    expect((await api.get("/api/households/link", token)).body).toEqual({ pending: null });
  });

  it("a scan whose CAN differs leaves the link pending with a different-account reason", async () => {
    const vision = switchableVision();
    vision.set("1000000003");
    const api = await harness({ links: {}, bills: { [A.sin]: twelve }, vision });
    const token = await api.login(NEW);
    await api.post("/api/households/link", { can: A.can }, token);
    const scan = await api.upload("/api/bills/scan", undefined, undefined, token);
    expect(scan.body.link).toEqual({ status: "pending", reason: "differentAccount", canMasked: "10•• ••• 001" });
    expect((await api.get(`/api/households/${A.sin}/bills`, token)).status).toBe(403);
  });

  it("a CAN the scan cannot read is typed from the Bill before the match", async () => {
    const vision = switchableVision();
    vision.set(null);
    const api = await harness({ links: {}, bills: { [A.sin]: twelve }, vision });
    const token = await api.login(NEW);
    await api.post("/api/households/link", { can: A.can }, token);
    const scan = await api.upload("/api/bills/scan", undefined, undefined, token);
    expect(scan.body.canMasked).toBeNull();
    expect(scan.body.link).toEqual({ status: "pending", reason: "canUnread", canMasked: "10•• ••• 001" });
    const scanToken = scan.body.scanToken;
    expect((await api.post("/api/households/link/confirm", { scanToken }, token)).status).toBe(400);
    expect((await api.post("/api/households/link/confirm", { scanToken, can: "1000000003" }, token)).body)
      .toEqual({ status: "pending", reason: "differentAccount", canMasked: "10•• ••• 001" });
    expect((await api.post("/api/households/link/confirm", { scanToken, can: "1000-000-001" }, token)).body)
      .toEqual({ status: "active", householdSin: A.sin, canMasked: "10•• ••• 001" });
    expect((await api.get(`/api/households/${A.sin}/bills`, token)).status).toBe(200);
  });

  it("a typed CAN cannot override one the scan did read", async () => {
    const vision = switchableVision();
    vision.set("1000000003");
    const api = await harness({ links: {}, vision });
    const token = await api.login(NEW);
    await api.post("/api/households/link", { can: A.can }, token);
    const scanToken = (await api.upload("/api/bills/scan", undefined, undefined, token)).body.scanToken;
    expect((await api.post("/api/households/link/confirm", { scanToken, can: A.can }, token)).body.status).toBe("pending");
  });

  it("a CAN already active for another login is refused", async () => {
    const vision = switchableVision();
    const api = await harness({ links: { "owner@example.test": [A.sin] }, vision });
    const token = await api.login(NEW);
    const res = await api.post("/api/households/link", { can: A.can }, token);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/contact the account owner/);
    expect((await api.get(`/api/households/${A.sin}/bills`, token)).status).toBe(404);
  });

  it("refuses at scan time when another login activated the same CAN first", async () => {
    const vision = switchableVision();
    const api = await harness({ links: {}, vision });
    const first = await api.login("first@example.test");
    const second = await api.login("second@example.test");
    await api.post("/api/households/link", { can: A.can }, first);
    await api.post("/api/households/link", { can: A.can }, second);
    expect((await api.upload("/api/bills/scan", undefined, undefined, first)).body.link.status).toBe("active");
    const late = await api.upload("/api/bills/scan", undefined, undefined, second);
    expect(late.body.link).toMatchObject({ status: "refused", reason: "ownedByAnother" });
    expect((await api.get(`/api/households/${A.sin}/bills`, second)).status).toBe(403);
  });

  it("smart meter Households follow the same rule: readings load only after the scan", async () => {
    const vision = switchableVision();
    vision.set(SMART.can);
    const api = await harness({ links: {}, vision });
    const token = await api.login(NEW);
    const linked = await api.post("/api/households/link", { can: SMART.can }, token);
    expect(linked.body.meterType).toBe("smart");
    expect((await api.get(`/api/households/${SMART.sin}/readings?interval=day`, token)).status).toBe(403);
    await api.upload("/api/bills/scan", undefined, undefined, token);
    expect((await api.get(`/api/households/${SMART.sin}/readings?interval=day`, token)).status).toBe(200);
  });

  it("re-linking an already active CAN for the same login reports it active", async () => {
    const api = await harness();
    const token = await api.login();
    expect((await api.post("/api/households/link", { can: A.can }, token)).body).toMatchObject({ status: "active", householdSin: A.sin });
  });

  it("typing another CAN replaces the earlier pending link", async () => {
    const api = await harness({ links: {} });
    const token = await api.login(NEW);
    await api.post("/api/households/link", { can: A.can }, token);
    await api.post("/api/households/link", { can: SMART.can }, token);
    expect((await api.get("/api/households/link", token)).body.pending.canMasked).toBe("10•• ••• 002");
    expect((await api.get(`/api/households/${A.sin}/bills`, token)).status).toBe(404);
  });

  it.each([{}, { can: "123" }, { can: "12345678901" }, { can: "abcdefghij" }, { can: 1000000001 }])("rejects malformed CAN input %j", async (body) => {
    const api = await harness({ links: {} });
    expect((await api.post("/api/households/link", body, await api.login(NEW))).status).toBe(400);
  });

  it("an unknown CAN is 404 and linking needs a session", async () => {
    const api = await harness({ links: {} });
    expect((await api.post("/api/households/link", { can: "9999999999" }, await api.login(NEW))).status).toBe(404);
    expect((await api.post("/api/households/link", { can: A.can })).status).toBe(401);
    expect((await api.get("/api/households/link")).status).toBe(401);
  });
});
