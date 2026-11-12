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
    expect(body.badge).toEqual({ status: "green", label: "Tugma ang bill" });
    // ₱640 up; the biggest upward part is the household's own use (Habit ₱266.67 > Rate ₱240 > Days ₱133.33).
    expect(body.bakitGanito).toEqual({
      sentence: "Tumaas ng ₱640.00 mula Setyembre, pinakamalaki ang mas maraming gamit sa bahay.",
      total: 64_000,
      screen: "bakit-ganito",
    });
    expect(body.tamaBa).toMatchObject({ status: "green", failedChecks: 0, screen: "tama-ba" });
    expect(body.action).toEqual({ kind: "missions", label: "Tingnan ang Missions", screen: "missions" });
    expect(body.smartMeter).toBeNull();
  });

  it("turns red and switches the action to 'Itanong kay Meralco' when a Bill Check fails", async () => {
    // Printed total ₱3,000 but the printed lines add up to ₱2,690.
    const { body } = await home(TRADITIONAL, { [TRADITIONAL]: bills(3000) });

    expect(body.badge.status).toBe("red");
    expect(body.tamaBa.failedChecks).toBe(1);
    expect(body.action.kind).toBe("askMeralco");
    expect(body.action.label).toBe("Itanong kay Meralco");
    expect(body.action.screen).toBe("tama-ba");
    expect(body.action.summary).toBe(body.tamaBa.summary);
    expect(body.action.summary.length).toBeGreaterThan(0);
  });

  it("says when the Bill went down", async () => {
    const down: Bill[] = [bill("2026-09", 300, 30), bill("2026-10", 200, 30)];
    const { body } = await home(TRADITIONAL, { [TRADITIONAL]: down });
    expect(body.bakitGanito.sentence).toMatch(/^Bumaba ng ₱/);
    expect(body.bakitGanito.total).toBeLessThan(0);
  });

  it("works with a single Bill: no comparison yet, amount due from the printed lines", async () => {
    const { body } = await home(TRADITIONAL, { [TRADITIONAL]: [bill("2026-10", 240, 32, lines(1584, 1056))] });
    expect(body.bill.amountDue).toBe(269_000);
    expect(body.bill.dueDate).toBeNull();
    expect(body.bakitGanito).toBeNull();
    expect(body.bakitGanitoUnavailable).toBe("Kailangan ng dalawang Bill para maikumpara.");
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
    const tokenB = await api.login(testLogins[1]!.email, testLogins[1]!.password);
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
      label: "May nagbago ba sa bahay? Tingnan ang Missions",
      screen: "missions",
    });
    expect(homeAction("red", "summary").kind).toBe("askMeralco");
    expect(homeAction("green", "summary").kind).toBe("missions");
  });
});
