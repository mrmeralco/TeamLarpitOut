import { describe, expect, it } from "vitest";
import { MeralcoApiSource } from "../src/bills/meralcoApiSource.js";
import { meralcoAccountOf, realBillHousehold } from "../src/bills/real-bill-household.js";
import type { RateSchedule } from "../src/domain/rate-schedule.js";
import table from "../src/data/rate-schedules.json" with { type: "json" };
import type { RawBillReading, VisionProvider } from "../src/vision/vision-provider.interface.js";
import { harness, testAccounts } from "./utils/test-harness.js";

const REAL = meralcoAccountOf(realBillHousehold({}));
const OWNER = "bill-owner@example.test";
const path = (rest = "") => `/api/households/${REAL.sin}${rest}`;

/** Vision that reads the real Bill's CAN (here, its placeholder) off any photo. */
const readsRealBill: VisionProvider = {
  async readBill(): Promise<RawBillReading> {
    return { readable: true, customerAccountNumber: REAL.can, serviceIdNumber: null, period: "2026-09", kwh: 273, billingDays: 31 };
  },
  async readEnergyLabel() { return { readable: false }; },
};

const realHarness = (links: Record<string, string[]> = { [OWNER]: [REAL.sin] }) => harness({
  billSource: new MeralcoApiSource(),
  accounts: [...testAccounts, REAL],
  links,
  schedules: table.schedules as RateSchedule[],
  vision: readsRealBill,
});

describe("the real-Bill Household, end to end", () => {
  it("explains September 2026 against August to the centavo of the two real totals", async () => {
    const api = await realHarness();
    const token = await api.login(OWNER);
    const history = await api.get(path("/bills"), token);
    expect(history.body.map((b: any) => b.provenance.kind)).toEqual([...Array(11).fill("reconstructed"), "real"]);
    const { body } = await api.get(path("/bakit-ganito"), token);
    expect([body.before.period, body.now.period]).toEqual(["2026-08", "2026-09"]);
    expect(body.total).toBe(412263 - 435949);
    expect(body.printedChange).toBe(body.total);
    expect(body.effects.reduce((s: number, e: any) => s + e.amount, 0)).toBe(body.total);
  });

  it("passes every Bill Check and shows each charge's change vs August", async () => {
    const api = await realHarness();
    const token = await api.login(OWNER);
    const checks = await api.get(path("/check"), token);
    expect(checks.body.overall).toBe("green");
    expect(checks.body.checks.map((c: any) => [c.key, c.status])).toEqual([
      ["lineSum", "pass"], ["readingContinuity", "pass"], ["rateSchedule", "pass"], ["paymentReflection", "pass"],
    ]);
    const home = await api.get(path("/home"), token);
    const taxes = home.body.chargeLines.all.find((l: any) => l.id === "taxes");
    expect(taxes).toMatchObject({ amount: 37464, previous: 39508, change: -2044 });
  });

  it("a new login links it by scanning the Bill; another login can link the same Bill too", async () => {
    const api = await realHarness({});
    const newUser = await api.login("new-user@example.test");
    const scan = await api.upload("/api/bills/scan", undefined, undefined, newUser);
    expect(scan.body.account).toMatchObject({ status: "found", area: "Caloocan City", billsOnRecord: 12, lastPeriod: "2026-09" });
    const linked = await api.post("/api/households/link/confirm", { scanToken: scan.body.scanToken }, newUser);
    expect(linked.body).toMatchObject({ status: "active", householdSin: REAL.sin });

    const other = await api.login("other-user@example.test");
    const second = await api.upload("/api/bills/scan", undefined, undefined, other);
    expect(second.body.account.status).toBe("found");
    const linkedToo = await api.post("/api/households/link/confirm", { scanToken: second.body.scanToken }, other);
    expect(linkedToo.body).toMatchObject({ status: "active", householdSin: REAL.sin });
    expect((await api.get(path("/bills"), other)).status).toBe(200);
    expect((await api.get(path("/bills"), newUser)).status).toBe(200);
  });
});
