import { describe, expect, it } from "vitest";
import { MeralcoApiSource } from "../src/bills/meralcoApiSource.js";
import { DEMO_ACCOUNTS } from "../src/bills/meralco-accounts.js";
import rates from "../src/data/rate-schedules.json" with { type: "json" };
import seed from "../src/data/meralco-demo-seed.json" with { type: "json" };
import { bill, harness } from "./utils/test-harness.js";

const path = (sin = "1234567890") => `/api/households/${sin}/bills`;

describe("GET /api/households/:sin/bills", () => {
  it("never returns history without a valid login, including guessed SINs", async () => {
    const api = await harness({ billSource: new MeralcoApiSource() });
    for (const sin of ["1234567890", "9876543210", "unknown"]) {
      expect((await api.get(path(sin))).status).toBe(401);
      expect((await api.get(path(sin), "fake-token")).status).toBe(401);
    }
  });

  it("returns twelve consecutive chronological Bills, with honest provenance and preserved recent samples", async () => {
    const api = await harness({ billSource: new MeralcoApiSource() });
    const token = await api.login();
    const response = await api.get(path(), token);
    expect(response.status).toBe(200);
    expect(response.body.map((b: any) => b.period)).toEqual(seed.months.map((m) => m.period));
    expect(response.body.filter((b: any) => b.provenance.kind === "generated")).toHaveLength(9);
    expect(response.body.filter((b: any) => b.provenance.kind === "sample")).toHaveLength(3);
    for (const anchor of seed.households[0]!.recentBills) {
      expect(response.body.find((b: any) => b.period === anchor.period)).toMatchObject(anchor);
    }
    for (const b of response.body) {
      expect(b.kwh).toBeGreaterThanOrEqual(0);
      expect(b.presentReading - b.previousReading).toBe(b.kwh);
      expect(b.chargeLines.length).toBeGreaterThan(0);
    }
  });

  it("keeps two Household histories separate through repeated switching and uses the latest pair for explanations", async () => {
    const api = await harness({ billSource: new MeralcoApiSource(), schedules: rates.schedules });
    const token = await api.login();
    const first = await api.get(path(), token);
    const second = await api.get(path("9876543210"), token);
    expect(second.status).toBe(200);
    expect(first.body.at(-1).kwh).toBe(230);
    expect(second.body.at(-1).kwh).toBe(370);
    expect(await api.get(path(), token)).toEqual(first);
    const explained = await api.get("/api/households/1234567890/bakit-ganito", token);
    expect(explained.status).toBe(200);
    expect(explained.body.before.period).toBe("2026-10");
    expect(explained.body.now.period).toBe("2026-11");
    expect(explained.body.printedChange).toBe(explained.body.total);
    expect(explained.body.effects.reduce((sum: number, e: any) => sum + e.amount, 0)).toBe(explained.body.total);
  });

  it("gives inaccessible and unknown Households the same 404 even when their Bills exist", async () => {
    const api = await harness({ billSource: new MeralcoApiSource() });
    const token = await api.login("owner-b@example.test");
    const foreign = await api.get(path(), token);
    expect(foreign).toEqual(await api.get(path("unknown"), token));
    expect(foreign).toEqual({ status: 404, body: { error: "Household not found." } });
  });

  it("sorts source Bills and returns only the latest twelve", async () => {
    const bills = [bill("2025-10", 1, 30), bill("2025-11", 2, 30), ...seed.months.map((m) => bill(m.period, 100, m.billingDays))];
    const api = await harness({ billSource: { bills: async () => bills.slice().reverse() } });
    const response = await api.get(path(), await api.login());
    expect(response.status).toBe(200);
    expect(response.body.map((b: any) => b.period)).toEqual(seed.months.map((m) => m.period));
  });

  it("returns an empty history for no records and does not reuse another Household's data on failure", async () => {
    const api = await harness({ billSource: { bills: async (sin) => {
      if (sin === "1234567890") return [bill("2026-10", 50, 30)];
      throw new Error("source unavailable");
    } } });
    const token = await api.login();
    expect((await api.get(path(), token)).body).toHaveLength(1);
    const failed = await api.get(path("9876543210"), token);
    expect(failed).toEqual({ status: 502, body: { error: "We couldn't get the Bill History. Please try again." } });
    const empty = await harness();
    expect(await empty.get(path(), await empty.login())).toEqual({ status: 200, body: [] });
  });

  it("serves the demo histories to a linked demo login and denies history after logout", async () => {
    const api = await harness({
      accounts: DEMO_ACCOUNTS, links: { "demo@example.com": DEMO_ACCOUNTS.map((a) => a.sin) }, billSource: new MeralcoApiSource(),
    });
    const token = await api.login("demo@example.com");
    expect((await api.get(path(), token)).body).toHaveLength(12);
    await api.post("/api/auth/logout", {}, token);
    expect((await api.get(path(), token)).status).toBe(401);
  });
});
