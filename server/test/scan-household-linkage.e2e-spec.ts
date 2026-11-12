import { describe, expect, it } from "vitest";
import type { RawBillReading } from "../src/vision/vision-provider.interface.js";
import { MeralcoApiSource } from "../src/bills/meralcoApiSource.js";
import { bill, harness } from "./utils/test-harness.js";

const reading: RawBillReading = {
  readable: true, serviceIdNumber: "1234567890", period: "2026-10", kwh: 200, billingDays: 31,
  history: [{ period: "2026-09", kwh: 150 }],
};

describe("POST /api/bills/scan-linkage", () => {
  it("supports scan before login, confirmation and public verdict, then resolves linkage after login", async () => {
    const api = await harness({ vision: reading, billSource: new MeralcoApiSource() });
    const scan = await api.upload("/api/bills/scan");
    expect(scan.status).toBe(200);
    expect(scan.body.scanToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(scan.body.serviceIdMasked).toBe("••••••7890");
    expect(JSON.stringify(scan.body)).not.toContain("1234567890");
    expect(scan.body.effects).toBeUndefined();
    const verdict = await api.post("/api/bakit-ganito", { before: { ...scan.body.before, billingDays: 30 }, now: scan.body.now });
    expect(verdict.status).toBe(200);
    const token = await api.login();
    expect(await api.post("/api/bills/scan-linkage", { scanToken: scan.body.scanToken }, token))
      .toEqual({ status: 200, body: { status: "linked", householdSin: "1234567890" } });
    expect((await api.get("/api/households/1234567890/bills", token)).body).toHaveLength(12);
  });

  it("never treats a photo or scan reference as login, including when used as a bearer token", async () => {
    const api = await harness({ vision: reading });
    const scanToken = (await api.upload("/api/bills/scan")).body.scanToken;
    expect((await api.post("/api/bills/scan-linkage", { scanToken })).status).toBe(401);
    expect((await api.post("/api/bills/scan-linkage", { scanToken }, scanToken)).status).toBe(401);
    for (const path of ["/api/households/1234567890/bills", "/api/households/1234567890/bakit-ganito"]) {
      expect((await api.get(path, scanToken)).status).toBe(401);
    }
  });

  it("returns only unlinked for a foreign or unknown full SIN, even if its masked suffix matches", async () => {
    for (const sin of ["5555555555", "9999567890", "0000000000"]) {
      const api = await harness({ vision: { ...reading, serviceIdNumber: sin } });
      const scanToken = (await api.upload("/api/bills/scan")).body.scanToken;
      const response = await api.post("/api/bills/scan-linkage", { scanToken, householdSin: "1234567890", serviceIdNumber: "1234567890" }, await api.login());
      expect(response).toEqual({ status: 200, body: { status: "unlinked" } });
      expect(JSON.stringify(response.body)).not.toContain(sin);
      expect((await api.post("/api/bakit-ganito", { before: bill("2026-09", 100, 30), now: bill("2026-10", 100, 30) })).status).toBe(200);
    }
  });

  it.each([undefined, null, "7890", "SIN1234567890"])("treats an incomplete/unreadable identifier as unknown: %s", async (sin) => {
    const api = await harness({ vision: { ...reading, serviceIdNumber: sin } });
    const scanToken = (await api.upload("/api/bills/scan")).body.scanToken;
    expect(await api.post("/api/bills/scan-linkage", { scanToken }, await api.login()))
      .toEqual({ status: 200, body: { status: "unknown" } });
  });

  it("normalizes formatting separators without matching partial identifiers", async () => {
    const api = await harness({ vision: { ...reading, serviceIdNumber: "123-456-7890" } });
    const scanToken = (await api.upload("/api/bills/scan")).body.scanToken;
    expect((await api.post("/api/bills/scan-linkage", { scanToken }, await api.login())).body)
      .toEqual({ status: "linked", householdSin: "1234567890" });
  });

  it("checks ownership for the current login and refuses linkage after logout", async () => {
    const api = await harness({ vision: reading });
    const scanToken = (await api.upload("/api/bills/scan")).body.scanToken;
    const first = await api.login();
    const other = await api.login("owner-b@example.test", "test-password-b");
    expect((await api.post("/api/bills/scan-linkage", { scanToken }, first)).body.status).toBe("linked");
    expect((await api.post("/api/bills/scan-linkage", { scanToken }, other)).body).toEqual({ status: "unlinked" });
    await api.post("/api/auth/logout", {}, first);
    expect((await api.post("/api/bills/scan-linkage", { scanToken }, first)).status).toBe(401);
  });

  it("expires references after fifteen minutes and gives unknown/expired references the same 404", async () => {
    let now = 0;
    const api = await harness({ vision: reading, clock: { now: () => now } });
    const scanToken = (await api.upload("/api/bills/scan")).body.scanToken;
    const token = await api.login();
    now = 15 * 60 * 1000 - 1;
    expect((await api.post("/api/bills/scan-linkage", { scanToken }, token)).body.status).toBe("linked");
    now++;
    const expired = await api.post("/api/bills/scan-linkage", { scanToken }, token);
    expect(expired.status).toBe(404);
    expect(expired).toEqual(await api.post("/api/bills/scan-linkage", { scanToken: "a".repeat(43) }, token));
    expect(expired.body.householdSin).toBeUndefined();
  });

  it.each([{}, { scanToken: "short" }, { scanToken: 123 }, { scanToken: "a".repeat(44) }])("validates the reference: %j", async (body) => {
    const api = await harness();
    expect((await api.post("/api/bills/scan-linkage", body, await api.login())).status).toBe(400);
  });

  it("keeps scan contexts isolated across API instances", async () => {
    const api = await harness({ vision: reading });
    const scanToken = (await api.upload("/api/bills/scan")).body.scanToken;
    const otherApp = await harness();
    expect((await otherApp.post("/api/bills/scan-linkage", { scanToken }, await otherApp.login())).status).toBe(404);
  });
});
