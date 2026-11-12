import { describe, expect, it } from "vitest";
import type { Bill } from "../src/domain/bill.js";
import { homeAction, homeBadge } from "../src/domain/home-summary.js";
import { bill, harness, testLogins } from "./utils/test-harness.js";

const TRADITIONAL = "1234567890"; // owner-a
const SMART = "9876543210"; // owner-a
const FOREIGN = "5555555555"; // owner-b

const lines = (gen: number, dist: number) => [
  { label: "Generation", amount: gen },
  { label: "Distribution", amount: dist },
  { label: "Supply", amount: 50 },
];

/** September ₱2,050 → October ₱2,690 (rebuilt at ₱10 → ₱11/kWh), printed total as given. */
function bills(octoberTotal = 2690): Bill[] {
  return [
    { ...bill("2026-09", 200, 30, lines(1200, 800)), totalAmount: 2050 },
    { ...bill("2026-10", 240, 32, lines(1584, 1056)), totalAmount: octoberTotal, dueDate: "2026-11-15", billDate: "2026-11-01" },
  ];
}

async function home(sin: string, byHousehold: Record<string, Bill[]>) {
  const api = await harness({ bills: byHousehold });
  const token = await api.login();
  return api.get(`/api/households/${sin}/home`, token);
}

describe("GET /api/households/:sin/home", () => {
  it("shows the amount due, due date, a green badge, one Bakit ganito? sentence and Missions", async () => {
    const { status, body } = await home(TRADITIONAL, { [TRADITIONAL]: bills() });

    expect(status).toBe(200);
    expect(body.meterType).toBe("traditional");
    expect(body.bill).toEqual({ period: "2026-10", amountDue: 269_000, dueDate: "2026-11-15", billDate: "2026-11-01" });
    expect(body.badge).toEqual({ status: "green", label: "Bill verified" });
    // ₱640 up; the biggest upward part is the household's own use (Habit ₱266.67 > Rate ₱240 > Days ₱133.33).
    expect(body.bakitGanito).toMatchObject({
      sentence: "Up ₱640.00 from September, mostly from more use at home.",
      total: 64_000,
      screen: "bakit-ganito",
      previousPeriod: "2026-09",
      addsUp: true,
    });
    expect(body.bakitGanito.effects.map((e: { key: string }) => e.key)).toEqual(["rate", "billingDays", "weather", "habit"]);
    const parts = [...body.bakitGanito.effects, ...body.bakitGanito.lines];
    expect(parts.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)).toBe(64_000);
    expect(body.bakitGanito.habit).toBe(body.bakitGanito.effects[3].amount);
    expect(body.canMasked).toBe("10•• ••• 001");
    expect(body.tamaBa).toMatchObject({ status: "green", failedChecks: 0, screen: "tama-ba" });
    expect(body.action).toEqual({ kind: "missions", label: "See Missions", screen: "missions" });
    expect(body.smartMeter).toBeNull();
  });

  it("turns red and switches the action to 'Ask Meralco' when a Bill Check fails", async () => {
    // Printed total ₱3,000 but the printed lines add up to ₱2,690.
    const { body } = await home(TRADITIONAL, { [TRADITIONAL]: bills(3000) });

    expect(body.badge.status).toBe("red");
    expect(body.tamaBa.failedChecks).toBe(1);
    expect(body.action.kind).toBe("askMeralco");
    expect(body.action.label).toBe("Ask Meralco");
    expect(body.action.screen).toBe("tama-ba");
    expect(body.action.summary).toBe(body.tamaBa.summary);
    expect(body.action.summary.length).toBeGreaterThan(0);
  });

  it("says when the Bill went down", async () => {
    const down: Bill[] = [bill("2026-09", 300, 30), bill("2026-10", 200, 30)];
    const { body } = await home(TRADITIONAL, { [TRADITIONAL]: down });
    expect(body.bakitGanito.sentence).toMatch(/^Down ₱/);
    expect(body.bakitGanito.total).toBeLessThan(0);
  });

  it("works with a single Bill: no comparison yet, amount due from the printed lines", async () => {
    const { body } = await home(TRADITIONAL, { [TRADITIONAL]: [bill("2026-10", 240, 32, lines(1584, 1056))] });
    expect(body.bill.amountDue).toBe(269_000);
    expect(body.bill.dueDate).toBeNull();
    expect(body.bakitGanito).toBeNull();
    expect(body.bakitGanitoUnavailable).toBe("Two Bills are needed to compare.");
    expect(body.badge.status).toBe("green");
  });

  it("works for a smart meter Household", async () => {
    const { status, body } = await home(SMART, { [SMART]: bills() });
    expect(status).toBe(200);
    expect(body.meterType).toBe("smart");
    expect(body.smartMeter).toEqual({ monthToDateKwh: null });
    expect(body.action.kind).toBe("missions");
  });

  it("keeps the yellow Bill Checks badge and household-change action until a change explains the usage", async () => {
    const history = [bill("2026-07", 100, 30), bill("2026-08", 100, 30), bill("2026-09", 100, 30), bill("2026-10", 250, 30)];
    const api = await harness({ bills: { [TRADITIONAL]: history }, weather: { "2026-07": 2, "2026-08": 2, "2026-09": 2, "2026-10": 2 } });
    const token = await api.login();
    const yellow = await api.get(`/api/households/${TRADITIONAL}/home`, token);
    expect(yellow.status).toBe(200);
    expect(yellow.body.badge.status).toBe("yellow");
    expect(yellow.body.tamaBa.status).toBe("yellow");
    expect(yellow.body.action.kind).toBe("householdChange");

    const recorded = await api.post(`/api/households/${TRADITIONAL}/changes`, { reason: "bisita", period: "2026-10" }, token);
    expect(recorded.status).toBe(200);
    const green = await api.get(`/api/households/${TRADITIONAL}/home`, token);
    expect(green.body.badge.status).toBe("green");
    expect(green.body.action.kind).toBe("missions");
  });

  it("is only for the Household's owner, and needs a Bill", async () => {
    const api = await harness({ bills: { [TRADITIONAL]: bills() } });
    const token = await api.login();
    expect((await api.get(`/api/households/${TRADITIONAL}/home`)).status).toBe(401);
    expect((await api.get(`/api/households/${FOREIGN}/home`, token)).status).toBe(404);
    expect((await api.get(`/api/households/${SMART}/home`, token)).status).toBe(404);
    const tokenB = await api.login(testLogins[1]!.email);
    expect((await api.get(`/api/households/${TRADITIONAL}/home`, tokenB)).status).toBe(404);
  });
});

describe("Home badge and action", () => {
  it("red wins over a Usage Outlier; yellow asks about the household, never Meralco", () => {
    expect(homeBadge({ checksOverall: "red", usageOutlier: true })).toBe("red");
    expect(homeBadge({ checksOverall: "green", usageOutlier: true })).toBe("yellow");
    expect(homeBadge({ checksOverall: "yellow" })).toBe("yellow");
    expect(homeBadge({ checksOverall: "green" })).toBe("green");

    expect(homeAction("yellow", "summary")).toEqual({
      kind: "householdChange",
      label: "Did something change at home? See Missions",
      screen: "missions",
    });
    expect(homeAction("red", "summary").kind).toBe("askMeralco");
    expect(homeAction("green", "summary").kind).toBe("missions");
  });

  it("lists every charge as its own line with amount, change and who gets the money; System loss and Taxes included", async () => {
    const printed = (gen: number, sl: number, vat: number, lgu: number) => [
      { label: "Generation Charge", amount: gen }, { label: "Transmission Charge", amount: 200 },
      { label: "System Loss Charge", amount: sl }, { label: "Distribution Charge", amount: 300 },
      { label: "Supply Charge (per customer)", amount: 16.38 }, { label: "VAT (per kWh lines)", amount: vat },
      { label: "Local Franchise Tax", amount: lgu }, { label: "Mystery adjustment", amount: 5 },
    ];
    const history = [bill("2026-09", 200, 30, printed(1300, 120, 190, 10)), bill("2026-10", 240, 30, printed(1500, 145, 220, 12))];
    const { body } = await home(TRADITIONAL, { [TRADITIONAL]: history });
    const ids = body.chargeLines.featured.map((l: { id: string }) => l.id);
    expect(ids).toEqual(["generation", "distribution", "system_loss", "transmission", "taxes"]);
    const byId = Object.fromEntries(body.chargeLines.all.map((l: { id: string }) => [l.id, l]));
    expect(byId.system_loss).toMatchObject({ label: "System loss", amount: 14_500, previous: 12_000, change: 2_500, goesTo: "Pass-through" });
    expect(byId.taxes).toMatchObject({ amount: 23_200, previous: 20_000, change: 3_200, goesTo: "Government", printed: ["VAT (per kWh lines)", "Local Franchise Tax"] });
    expect(byId.distribution.goesTo).toBe("Meralco");
    expect(byId["other-mystery-adjustment"]).toMatchObject({ goesTo: null, payee: null, amount: 500 });
    const sum = body.chargeLines.all.reduce((s: number, l: { amount: number }) => s + l.amount, 0);
    expect(sum).toBe(Math.round(printed(1500, 145, 220, 12).reduce((s, l) => s + l.amount, 0) * 100));
  });
});
