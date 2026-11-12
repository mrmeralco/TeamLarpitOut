import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { clearPlanCache, MissionPlan } from "../src/components/MissionPlan";
import type { MissionPlan as Plan, PlanMission } from "../src/api/client";

const household = { sin: "1234567890", masked_address: "••• Caloocan City", meter_type: "traditional" as const };
const m = (id: string, title: string, percent: number, peso: number, extra: Partial<PlanMission> = {}): PlanMission => ({
  id, title, why: `Why ${title}.`, how: ["Step one.", "Step two."], appliance: id.split("-")[0]!, kwhSaved: percent * 6.2, pesoValue: peso,
  percent, share: percent / 5, rewardPoints: Math.max(1, Math.round(peso / 100)), effort: "Easy", basis: "physics", assumptions: [], ...extra,
});
const plan = (missions: PlanMission[], over: Partial<Plan> = {}): Plan => ({
  period: "2026-11", goal: { cut: 5, kwh: 31, pesos: 34100, baselineKwh: 620, targetKwh: 589, targetPesos: 600000 },
  covered: 1, coveredPercent: 5, source: "ai", points: "Each mission is worth 1 point per ₱1 it saves.", missions,
  rewardPoints: missions.reduce((s, x) => s + x.rewardPoints, 0),
  pointsBalance: 100,
  climate: { phase: "elNino", label: "Very strong El Niño", multiplier: 1.3, source: "PAGASA climate advisory, 23 Sep 2026" }, ...over,
});
const first = [
  m("aircon-off-1h", "Turn off the aircon 1 hour earlier", 3, 20800),
  m("iron-batch", "Iron clothes once a week, all at once", 0.7, 4500, { basis: "assumption", effort: "Medium", assumptions: [{ key: "ironBatch", label: "Savings from heating up once (assumption)", value: 0.2 }] }),
  m("ref-medium", "Set the ref to medium, not max", 0.6, 4000),
];
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: string) => {
    if (input.endsWith("/missions/plan")) return response(plan(first));
    if (input.endsWith("/iron-batch/remind")) return response({ missionId: "iron-batch", reminded: true, reminders: ["iron-batch"] });
    if (input.endsWith("/plan/shuffle")) return response({ ...plan([m("lights-off", "Lights off in empty rooms", 2.6, 17000), first[1]!, first[2]!]), changed: true });
    if (input.endsWith("/iron-batch/swap")) return response({ ...plan([first[0]!, m("unplug-standby", "Unplug the TV and chargers at night", 0.5, 2100), first[2]!]), swapped: { out: "iron-batch", in: "unplug-standby" } });
    throw new Error(`Unexpected ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearPlanCache(); });

describe("Missions tab: the 5% plan", () => {
  it("shows the collected points, goal, how much the plan covers, and the plan list", async () => {
    render(<MissionPlan token="t" household={household} onOpen={() => {}} onBack={() => {}} onExpired={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Use 5% less electricity" })).toBeTruthy();
    expect(screen.getByText(/100 pts/)).toBeTruthy();
    expect(screen.getByText("Points collected")).toBeTruthy();
    expect(screen.getByText("About 31 kWh, or ~₱341 off your bill")).toBeTruthy();
    expect(screen.getByText("Your plan covers 5.0% · Goal reached")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByRole("button", { name: /Turn off the aircon 1 hour earlier.*−3\.0% · ~₱208/ })).toBeTruthy();
    expect(screen.getByText(/AI picks and words the missions/)).toBeTruthy();
    // Each mission shows its points; the goal meter shows the whole plan's.
    expect(screen.getByRole("button", { name: /Turn off the aircon 1 hour earlier/ }).textContent).toContain("+208 pts");
    expect(screen.getByText("+293 pts")).toBeTruthy();
    expect(screen.queryByText(/verified/i)).toBeNull();
    // This month's climate sets the multiplier; a brownout month earns nothing.
    expect(screen.getByText("Very strong El Niño")).toBeTruthy();
    expect(screen.getByText(/points ×1\.3/)).toBeTruthy();
    expect(screen.getByText(/Brownout month = 0 pts/)).toBeTruthy();
  });

  it("Check rewards button navigates to the Rewards tab", async () => {
    const onRewards = vi.fn();
    render(<MissionPlan token="t" household={household} onOpen={() => {}} onBack={() => {}} onRewards={onRewards} onExpired={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Check rewards" }));
    expect(onRewards).toHaveBeenCalledTimes(1);
  });

  it("shows a brownout on Meralco's record for the plan's month", async () => {
    fetchMock.mockImplementationOnce(async () => response(plan(first, { outage: { date: "2026-11-18", durationHours: 4, description: "Scheduled maintenance" } })));
    render(<MissionPlan token="t" household={household} onOpen={() => {}} onBack={() => {}} onExpired={() => {}} />);
    expect(await screen.findByText(/Brownout on Meralco's record · Nov 18/)).toBeTruthy();
    expect(screen.getByText(/4 h · no points this month/)).toBeTruthy();
  });

  it("a smart meter home sees today's missions, its streak and yesterday's points, and no Shuffle", async () => {
    const today = [m("aircon-25c", "Set the aircon to 25°C", 5, 1160, { rewardPoints: 5 }), m("unplug-standby", "Unplug the TV and chargers at night", 0.3, 60, { rewardPoints: 1 }), m("ref-door", "Open the ref less often", 0.3, 53, { rewardPoints: 1 })];
    fetchMock.mockImplementationOnce(async () => response(plan(first, {
      daily: { date: "2026-11-13", goal: { kwh: 0.62, pesos: 913 }, rewardPoints: 6, missions: today, yesterday: { date: "2026-11-12", points: 5, savedKwh: 0.71, hasOutage: false }, streak: 3 },
    })));
    render(<MissionPlan token="t" household={{ ...household, meter_type: "smart" }} onOpen={() => {}} onBack={() => {}} onExpired={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Today's missions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Set the aircon to 25°C/ }).textContent).toContain("~₱12 today");
    expect(screen.getByText("3-day streak")).toBeTruthy();
    expect(screen.getByText("Yesterday: +5 pts · 0.7 kWh saved")).toBeTruthy();
    expect(screen.getByText(/Today's missions cover/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Shuffle" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Turn off the aircon 1 hour earlier/ })).toBeNull();
  });

  it("Mission detail shows share of goal, could save, effort, why, how, points, labelled assumptions, remind and swap", async () => {
    const onBack = vi.fn();
    render(<MissionPlan token="t" household={household} missionId="iron-batch" onOpen={() => {}} onBack={onBack} onExpired={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Iron clothes once a week, all at once" })).toBeTruthy();
    expect(screen.getByText("Mission 2 of 3 in your plan")).toBeTruthy();
    expect(screen.getByText("0.7%")).toBeTruthy();
    expect(screen.getByText("~₱45")).toBeTruthy();
    expect(screen.getByText("Medium")).toBeTruthy();
    expect(screen.getByText("Why Iron clothes once a week, all at once.")).toBeTruthy();
    expect(screen.getByText("Step two.")).toBeTruthy();
    expect(screen.getByText(/1 point per ₱1 it saves/)).toBeTruthy();
    expect(screen.getByText("+45 pts")).toBeTruthy();
    expect(screen.getByText("Based on assumptions")).toBeTruthy();
    expect(screen.getByText("Savings from heating up once (assumption): 0.2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remind me tonight" }));
    expect(await screen.findByRole("button", { name: "Reminder set ✓" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/missions/iron-batch/remind"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Swap for a different mission" }));
    await vi.waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/iron-batch/swap"))).toBe(true);
  });
});
