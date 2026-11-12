import { describe, expect, it } from "vitest";
import { mockMyMeralcoSource } from "../src/bills/myMeralcoSource.js";
import { bill, harness, testLogins } from "./utils/test-harness.js";

const householdPath = (sin: string) => `/api/households/${sin}/bakit-ganito`;
const pair = [bill("2026-09", 100, 30), bill("2026-10", 100, 30)];

describe("mock My Meralco login", () => {
  it("returns a token and only the login's linked Households, with masked addresses and Meter Types", async () => {
    const api = await harness();
    const { status, body } = await api.post("/api/auth/login", {
      email: testLogins[0]!.email, password: testLogins[0]!.password,
      ownerId: "owner-b", households: testLogins[1]!.households,
    });
    expect(status).toBe(200);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.households).toEqual(testLogins[0]!.households);
    expect(Object.keys(body).sort()).toEqual(["households", "token"]);
    expect(JSON.stringify(body)).not.toContain(testLogins[0]!.password);
    expect((await api.get("/api/households", body.token)).body).toEqual(body.households);
  });

  it("supports the fixed public demo credentials", async () => {
    const api = await harness({ myMeralco: mockMyMeralcoSource() });
    const { status, body } = await api.post("/api/auth/login", {
      email: "demo@example.com", password: "kuryenteko-demo",
    });
    expect(status).toBe(200);
    expect(body.households.map((h: any) => h.meter_type)).toEqual(["traditional", "smart"]);
  });

  it("uses the same 401 response for an unknown email and a wrong password", async () => {
    const api = await harness();
    const wrong = await api.post("/api/auth/login", { email: testLogins[0]!.email, password: "wrong" });
    const unknown = await api.post("/api/auth/login", { email: "unknown@example.test", password: "wrong" });
    expect(wrong).toEqual(unknown);
    expect(wrong.status).toBe(401);
    expect(wrong.body.token).toBeUndefined();
    expect(wrong.body.households).toBeUndefined();
  });

  it.each([
    {}, { email: "invalid", password: "password" }, { email: testLogins[0]!.email },
    { email: testLogins[0]!.email, password: "" },
    { email: testLogins[0]!.email, password: 123 },
    { email: testLogins[0]!.email, password: "x".repeat(257) },
  ])("rejects malformed login input: %j", async (body) => {
    const api = await harness();
    expect((await api.post("/api/auth/login", body)).status).toBe(400);
  });

  it("allows a login with no linked Households", async () => {
    const api = await harness();
    const token = await api.login(testLogins[2]!.email, testLogins[2]!.password);
    expect(await api.get("/api/households", token)).toEqual({ status: 200, body: [] });
    expect((await api.get(householdPath("1234567890"), token)).status).toBe(404);
  });
});

describe("sessions and Household access", () => {
  it.each([undefined, "not-a-session", "malformed token"])("requires a valid session: %s", async (token) => {
    const api = await harness({ bills: { "1234567890": pair } });
    for (const path of ["/api/households", householdPath("1234567890"), householdPath("unknown")]) {
      const response = await api.get(path, token);
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Mag-login muna gamit ang My Meralco.");
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
    const b = await api.login(testLogins[1]!.email, testLogins[1]!.password);
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
    const source = mockMyMeralcoSource(testLogins);
    let linked = true;
    const api = await harness({
      myMeralco: { login: source.login, households: (id) => linked ? source.households(id) : Promise.resolve([]) },
      bills: { "1234567890": pair },
    });
    const token = await api.login();
    expect((await api.get(householdPath("1234567890"), token)).status).toBe(200);
    linked = false;
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
