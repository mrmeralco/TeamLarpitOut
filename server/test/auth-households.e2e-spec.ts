import { describe, expect, it, vi } from "vitest";
import { ownerIdForEmail } from "../src/auth/auth.service.js";
import { LogNotifier } from "../src/auth/notifier.interface.js";
import { bill, harness, TEST_CODE, TEST_NAME, TEST_PASSWORD, TEST_PHONE, testLogins } from "./utils/test-harness.js";

const householdPath = (sin: string) => `/api/households/${sin}/bakit-ganito`;
const pair = [bill("2026-09", 100, 30), bill("2026-10", 100, 30)];
const MINUTE = 60 * 1000;
const NEW = "rosa@example.test";

type Api = Awaited<ReturnType<typeof harness>>;
/** Sign-up steps 1–2: email + mobile, then the SMS code; returns the emailed link token. */
async function toLink(api: Api, email = NEW) {
  expect((await api.post("/api/auth/signup", { email, phone: TEST_PHONE, name: TEST_NAME })).status).toBe(202);
  expect((await api.post("/api/auth/signup/verify", { email, code: api.notifier.codes.at(-1)!.code })).status).toBe(200);
  return api.notifier.links.at(-1)!.token;
}

describe("sign up (like My Meralco): email + mobile → SMS code → email link → create password", () => {
  it("sends the code by SMS to the mobile number, then a verification link to the email", async () => {
    const api = await harness();
    const start = await api.post("/api/auth/signup", { email: "Rosa@Example.test", phone: TEST_PHONE, name: TEST_NAME });
    expect(start).toEqual({ status: 202, body: { channel: "sms", sentTo: "+63 917 ••• 4567", expiresInSeconds: 600 } });
    expect(api.notifier.codes).toEqual([{ channel: "sms", to: TEST_PHONE, code: TEST_CODE }]);
    const verify = await api.post("/api/auth/signup/verify", { email: NEW, code: TEST_CODE });
    expect(verify).toEqual({ status: 200, body: { sentTo: NEW, expiresInHours: 24 } });
    expect(api.notifier.links).toHaveLength(1);
    expect(api.notifier.links[0]!.link).toMatch(/\/#\/create-password\/[A-Za-z0-9_-]{43}$/);
  });

  it("can send the code by email instead", async () => {
    const api = await harness();
    await api.post("/api/auth/signup", { email: NEW, phone: TEST_PHONE, name: TEST_NAME });
    const resend = await api.post("/api/auth/signup/resend", { email: NEW, channel: "email" });
    expect(resend).toEqual({ status: 202, body: { channel: "email", sentTo: "r••a@example.test", expiresInSeconds: 600 } });
    expect(api.notifier.codes.at(-1)).toEqual({ channel: "email", to: NEW, code: TEST_CODE });
  });

  it("the link shows its email, then creating a password signs the person in; the link works once", async () => {
    const api = await harness();
    const token = await toLink(api);
    expect(await api.post("/api/auth/signup/link", { token })).toEqual({ status: 200, body: { email: NEW } });
    const done = await api.post("/api/auth/signup/password", { token, password: "rosa2026x" });
    expect(done.status).toBe(200);
    expect(Object.keys(done.body)).toEqual(["token"]);
    expect(await api.get("/api/households", done.body.token)).toEqual({ status: 200, body: [] });
    expect((await api.post("/api/auth/signup/password", { token, password: "another2026" })).status).toBe(410);
    expect((await api.post("/api/auth/signup/link", { token })).status).toBe(410);
  });

  it("rejects a weak password with the checklist rule", async () => {
    const api = await harness();
    const token = await toLink(api);
    for (const password of ["short1", "onlyletters", "12345678"]) {
      const res = await api.post("/api/auth/signup/password", { token, password });
      expect([password, res.status]).toEqual([password, 400]);
    }
    expect((await api.post("/api/auth/signup/password", { token, password: "letters123" })).status).toBe(200);
  });

  it("the verification link expires after 24 hours", async () => {
    let now = 0;
    const api = await harness({ clock: { now: () => now } });
    const token = await toLink(api);
    now = 24 * 60 * MINUTE;
    expect((await api.post("/api/auth/signup/password", { token, password: "rosa2026x" })).body.reason).toBe("expiredLink");
  });

  it("returns 401 for a wrong or expired (10 min) code, and locks it after 5 wrong tries", async () => {
    let now = 0;
    let next = 0;
    const api = await harness({ clock: { now: () => now }, codes: () => ["111111", "222222", "333333"][next++]! });
    await api.post("/api/auth/signup", { email: NEW, phone: TEST_PHONE, name: TEST_NAME });
    for (let i = 0; i < 5; i++) expect((await api.post("/api/auth/signup/verify", { email: NEW, code: "999999" })).status).toBe(401);
    expect((await api.post("/api/auth/signup/verify", { email: NEW, code: "111111" })).status).toBe(401);
    await api.post("/api/auth/signup/resend", { email: NEW, channel: "sms" });
    now = 10 * MINUTE;
    expect((await api.post("/api/auth/signup/verify", { email: NEW, code: "222222" })).status).toBe(401);
    await api.post("/api/auth/signup/resend", { email: NEW, channel: "sms" });
    expect((await api.post("/api/auth/signup/verify", { email: NEW, code: "333333" })).status).toBe(200);
    expect(api.notifier.links).toHaveLength(1);
  });

  it("tells an existing account to sign in instead", async () => {
    const api = await harness();
    await api.login(NEW);
    const again = await api.post("/api/auth/signup", { email: NEW, phone: TEST_PHONE, name: TEST_NAME });
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe("accountExists");
  });

  it.each([
    ["/api/auth/signup", { email: NEW }], ["/api/auth/signup", { email: NEW, phone: "09171234567" }], ["/api/auth/signup", { email: "invalid", phone: TEST_PHONE, name: TEST_NAME }],
    ["/api/auth/signup/verify", { email: NEW, code: "12345" }], ["/api/auth/signup/resend", { email: NEW, channel: "fax" }],
    ["/api/auth/signup/password", { token: "short", password: "rosa2026x" }], ["/api/auth/signin", { email: NEW }],
  ])("rejects malformed input to %s: %j", async (path, body) => {
    const api = await harness();
    expect((await api.post(path, body)).status).toBe(400);
  });

  it("the demo notifier logs the code and link and nothing about the person", async () => {
    const log = vi.fn();
    const notifier = new LogNotifier(log);
    await notifier.sendOtp("sms", "+639171234567", "482017");
    await notifier.sendVerificationLink("rosa.delacruz@example.test", "http://localhost:5173/#/create-password/abc");
    const written = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(written).toContain("482017");
    expect(written).toContain("/#/create-password/abc");
    expect(written).not.toMatch(/rosa|delacruz|9171234567|@/i);
  });
});

describe("sign in: email + password", () => {
  it("returns a session for the right password, the same login every time, ignoring case", async () => {
    const api = await harness();
    await api.login(testLogins[0]!.email);
    const res = await api.post("/api/auth/signin", { email: "OWNER-A@example.test", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await api.get("/api/households", res.body.token)).body).toEqual(testLogins[0]!.households);
    expect(ownerIdForEmail(" Owner-A@Example.TEST")).toBe(ownerIdForEmail("owner-a@example.test"));
  });

  it("gives one answer for a wrong password, an unknown email and an unfinished sign-up", async () => {
    const api = await harness();
    await api.login(NEW);
    await api.post("/api/auth/signup", { email: "half@example.test", phone: TEST_PHONE, name: TEST_NAME });
    const wrong = await api.post("/api/auth/signin", { email: NEW, password: "wrong-pass-9" });
    const unknown = await api.post("/api/auth/signin", { email: "nobody@example.test", password: TEST_PASSWORD });
    const unfinished = await api.post("/api/auth/signin", { email: "half@example.test", password: TEST_PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown).toEqual(wrong);
    expect(unfinished).toEqual(wrong);
    expect(wrong.body.error).toBe("The email or password is incorrect.");
  });

  it("the old email-code endpoints are gone", async () => {
    const api = await harness();
    expect((await api.post("/api/auth/email/start", { email: NEW })).status).toBe(404);
    expect((await api.post("/api/auth/login", { email: NEW, password: "x" })).status).toBe(404);
  });
});

describe("sessions and Household access", () => {
  it.each([undefined, "not-a-session", "malformed token"])("requires a valid session: %s", async (token) => {
    const api = await harness({ bills: { "1234567890": pair } });
    for (const path of ["/api/households", householdPath("1234567890"), householdPath("unknown")]) {
      const response = await api.get(path, token);
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Please sign in first.");
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
    expect(forbidden).toEqual({ status: 404, body: { error: "Household not found." } });
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

  it("the scan and decode endpoints return 401 without a token; a signed-in scan gets the full verdict", async () => {
    const api = await harness({ vision: { readable: true, serviceIdNumber: "1234567890", period: "2026-10", kwh: 100, billingDays: 30 } });
    expect((await api.upload("/api/bills/scan")).status).toBe(401);
    for (const [path, body] of [
      ["/api/bakit-ganito", { before: pair[0], now: pair[1] }],
      ["/api/bills/laman", { now: { chargeLines: [{ label: "Generation", amount: 1 }] } }],
      ["/api/bills/check", { now: pair[1], before: pair[0] }],
    ] as const) {
      const res = await api.post(path, body);
      expect([path, res.status, res.body.error]).toEqual([path, 401, "Please sign in first."]);
    }
    expect((await api.post("/api/bills/scan-linkage", { scanToken: "a".repeat(43) }, await api.userToken())).status).toBe(404);
    const verdict = await api.userPost("/api/bakit-ganito", { before: pair[0], now: pair[1] });
    expect(verdict.status).toBe(200);
    expect(verdict.body.effects.map((e: { key: string }) => e.key)).toEqual(["rate", "billingDays", "weather", "habit"]);
    const scan = await api.userUpload("/api/bills/scan");
    expect(scan.status).toBe(200);
    expect(scan.body.serviceIdMasked).toBe("••••••7890");
  });
});
