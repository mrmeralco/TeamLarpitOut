import { describe, expect, it, vi } from "vitest";
import { ownerIdForEmail } from "../src/auth/auth.service.js";
import { LogEmailSender } from "../src/auth/email-sender.interface.js";
import { bill, harness, TEST_CODE, testLogins } from "./utils/test-harness.js";

const householdPath = (sin: string) => `/api/households/${sin}/bakit-ganito`;
const pair = [bill("2026-09", 100, 30), bill("2026-10", 100, 30)];
const MINUTE = 60 * 1000;

describe("email code sign-in", () => {
  it("start → verify with the right code returns only a token; the code went to that email", async () => {
    const api = await harness();
    const start = await api.post("/api/auth/email/start", { email: "Someone@Example.test" });
    expect(start).toEqual({ status: 202, body: { sent: true, expiresInSeconds: 600 } });
    expect(api.email.sent).toEqual([{ email: "someone@example.test", code: TEST_CODE }]);
    const { status, body } = await api.post("/api/auth/email/verify", { email: "someone@example.test", code: TEST_CODE });
    expect(status).toBe(200);
    expect(Object.keys(body)).toEqual(["token"]);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("a new login has an empty Household list", async () => {
    const api = await harness();
    const token = await api.login("new-person@example.test");
    expect(await api.get("/api/households", token)).toEqual({ status: 200, body: [] });
    expect((await api.get(householdPath("1234567890"), token)).status).toBe(404);
  });

  it("returns 401 for a wrong code, an unknown email and an expired (10 min) code", async () => {
    let now = 0;
    const api = await harness({ clock: { now: () => now } });
    await api.post("/api/auth/email/start", { email: "a@example.test" });
    const wrong = await api.post("/api/auth/email/verify", { email: "a@example.test", code: "000000" });
    const unknown = await api.post("/api/auth/email/verify", { email: "b@example.test", code: TEST_CODE });
    expect(wrong.status).toBe(401);
    expect(unknown).toEqual(wrong);
    expect(wrong.body.token).toBeUndefined();
    now = 10 * MINUTE;
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: TEST_CODE })).status).toBe(401);
    now = 20 * MINUTE;
    await api.post("/api/auth/email/start", { email: "a@example.test" });
    now = 30 * MINUTE - 1;
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: TEST_CODE })).status).toBe(200);
  });

  it("codes are single-use", async () => {
    const api = await harness();
    await api.post("/api/auth/email/start", { email: "a@example.test" });
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: TEST_CODE })).status).toBe(200);
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: TEST_CODE })).status).toBe(401);
  });

  it("locks the code after 5 wrong tries for one email; a new start issues a new one", async () => {
    let next = 0;
    const codes = ["111111", "222222"];
    const api = await harness({ codes: () => codes[next++]! });
    await api.post("/api/auth/email/start", { email: "a@example.test" });
    for (let i = 0; i < 5; i++) {
      expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: "999999" })).status).toBe(401);
    }
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: "111111" })).status).toBe(401);
    await api.post("/api/auth/email/start", { email: "a@example.test" });
    expect(api.email.sent.map((m) => m.code)).toEqual(["111111", "222222"]);
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: "111111" })).status).toBe(401);
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: "222222" })).status).toBe(200);
  });

  it("a new start replaces the previous code", async () => {
    let next = 0;
    const api = await harness({ codes: () => ["111111", "222222"][next++]! });
    await api.post("/api/auth/email/start", { email: "a@example.test" });
    await api.post("/api/auth/email/start", { email: "a@example.test" });
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: "111111" })).status).toBe(401);
    expect((await api.post("/api/auth/email/verify", { email: "a@example.test", code: "222222" })).status).toBe(200);
  });

  it("the same email always maps to the same login, ignoring case and spaces", async () => {
    expect(ownerIdForEmail(" Owner-A@Example.TEST")).toBe(ownerIdForEmail("owner-a@example.test"));
    const api = await harness();
    const token = await api.login("OWNER-A@example.test");
    expect((await api.get("/api/households", token)).body).toEqual(testLogins[0]!.households);
  });

  it.each([
    ["/api/auth/email/start", {}], ["/api/auth/email/start", { email: "invalid" }], ["/api/auth/email/start", { email: `${"x".repeat(250)}@a.test` }],
    ["/api/auth/email/verify", { email: "a@example.test" }], ["/api/auth/email/verify", { email: "a@example.test", code: "12345" }],
    ["/api/auth/email/verify", { email: "a@example.test", code: "abcdef" }], ["/api/auth/email/verify", { email: "a@example.test", code: 123456 }],
  ])("rejects malformed input to %s: %j", async (path, body) => {
    const api = await harness();
    expect((await api.post(path, body)).status).toBe(400);
  });

  it("the old password login endpoint is gone", async () => {
    const api = await harness();
    expect((await api.post("/api/auth/login", { email: testLogins[0]!.email, password: "anything" })).status).toBe(404);
  });

  it("the demo sender logs the code and nothing about the person", async () => {
    const log = vi.fn();
    await new LogEmailSender(log).sendSignInCode("rosa.delacruz@example.test", "482017");
    const written = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(written).toContain("482017");
    expect(written).not.toMatch(/rosa|delacruz|example\.test|@/i);
  });
});

describe("sessions and Household access", () => {
  it.each([undefined, "not-a-session", "malformed token"])("requires a valid session: %s", async (token) => {
    const api = await harness({ bills: { "1234567890": pair } });
    for (const path of ["/api/households", householdPath("1234567890"), householdPath("unknown")]) {
      const response = await api.get(path, token);
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Mag-sign in muna.");
      expect(response.body.effects).toBeUndefined();
    }
    expect((await api.post("/api/auth/logout", {}, token)).status).toBe(401);
  });

  it("isolates both linked Households and denies the other owner's Household with the same response as an unknown SIN", async () => {
    const api = await harness({ bills: {
      "1234567890": pair,
      "9876543210": [bill("2026-09", 200, 30), bill("2026-10", 300, 30)],
      "5555555555": pair,
    } });
    const a = await api.login();
    const b = await api.login(testLogins[1]!.email);
    const first = await api.get(householdPath("1234567890"), a);
    const second = await api.get(householdPath("9876543210"), a);
    expect(first.status).toBe(200);
    expect(first.body.total).toBe(10_000);
    expect(second.status).toBe(200);
    expect(second.body.total).toBe(130_000);
    expect(await api.get(householdPath("1234567890"), a)).toEqual(first);
    expect((await api.get("/api/households", b)).body).toEqual(testLogins[1]!.households);
    expect((await api.get(householdPath("5555555555"), b)).status).toBe(200);
    const forbidden = await api.get(householdPath("5555555555"), a);
    expect(forbidden).toEqual(await api.get(householdPath("unknown"), a));
    expect(forbidden).toEqual({ status: 404, body: { error: "Hindi makita ang Household." } });
    expect((await api.get(householdPath("1234567890"), b)).status).toBe(404);
  });

  it("checks current membership rather than trusting a previously returned Household list", async () => {
    const api = await harness({ bills: { "1234567890": pair } });
    const token = await api.login();
    expect((await api.get(householdPath("1234567890"), token)).status).toBe(200);
    const owner = ownerIdForEmail(testLogins[0]!.email);
    await api.links.remove(owner, "1234567890");
    await api.links.remove(owner, "9876543210");
    expect((await api.get(householdPath("1234567890"), token)).status).toBe(404);
    expect((await api.get("/api/households", token)).body).toEqual([]);
  });

  it("expires sessions at the boundary and allows signing in again", async () => {
    let now = 0;
    const api = await harness({ clock: { now: () => now }, bills: { "1234567890": pair } });
    const token = await api.login();
    now = 60 * 60 * 1000 - 1;
    expect((await api.get("/api/households", token)).status).toBe(200);
    now++;
    expect((await api.get("/api/households", token)).status).toBe(401);
    expect((await api.get(householdPath("1234567890"), token)).status).toBe(401);
    expect((await api.get("/api/households", await api.login())).status).toBe(200);
  });

  it("logout revokes only that session; sessions are not shared across app instances", async () => {
    const api = await harness({ bills: { "1234567890": pair } });
    const token = await api.login();
    const another = await api.login();
    expect(another).not.toBe(token);
    expect((await api.post("/api/auth/logout", {}, token)).status).toBe(204);
    expect((await api.get("/api/households", token)).status).toBe(401);
    expect((await api.get(householdPath("1234567890"), token)).status).toBe(401);
    expect((await api.get("/api/households", another)).status).toBe(200);
    const otherApp = await harness();
    expect((await otherApp.get("/api/households", another)).status).toBe(401);
  });

  it("keeps the typed-Bill quick verdict and fake-vision scan public", async () => {
    const api = await harness({ vision: { readable: true, serviceIdNumber: "1234567890", period: "2026-10", kwh: 100, billingDays: 30 } });
    const verdict = await api.post("/api/bakit-ganito", { before: pair[0], now: pair[1] });
    expect(verdict.status).toBe(200);
    expect(verdict.body.total).toBe(10_000);
    const scan = await api.upload("/api/bills/scan");
    expect(scan.status).toBe(200);
    expect(scan.body.serviceIdMasked).toBe("••••••7890");
    expect((await api.get(householdPath("1234567890"))).status).toBe(401);
  });
});
