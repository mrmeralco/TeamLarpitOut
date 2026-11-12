import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { MissionPlan } from "../src/components/MissionPlan";
import type { MissionPlan as Plan, PlanMission } from "../src/api/client";

const household = { sin: "1234567890", masked_address: "••• Caloocan City", meter_type: "traditional" as const };
const m = (id: string, title: string, percent: number, peso: number, extra: Partial<PlanMission> = {}): PlanMission => ({
  id, title, why: `Why ${title}.`, how: ["Step one.", "Step two."], appliance: id.split("-")[0]!, kwhSaved: percent * 6.2, pesoValue: peso,
  percent, share: percent / 5, effort: "Easy", basis: "physics", assumptions: [], ...extra,
});
const plan = (missions: PlanMission[], over: Partial<Plan> = {}): Plan => ({
  period: "2026-11", goal: { cut: 5, kwh: 31, pesos: 34100, baselineKwh: 620, targetKwh: 589, targetPesos: 600000 },
  covered: 1, coveredPercent: 5, source: "ai", points: "Points are counted on your whole bill, not per mission.", missions, ...over,
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
    if (input.endsWith("/plan/shuffle")) return response({ ...plan([m("lights-off", "Lights off in empty rooms", 2.6, 17000), first[1]!, first[2]!]), changed: true });
    if (input.endsWith("/iron-batch/swap")) return response({ ...plan([first[0]!, m("unplug-standby", "Unplug the TV and chargers at night", 0.5, 2100), first[2]!]), swapped: { out: "iron-batch", in: "unplug-standby" } });
    throw new Error(`Unexpected ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Missions tab: the 5% plan", () => {
  it("shows the goal, how much the plan covers, and the plan list", async () => {
    render(<MissionPlan token="t" household={household} onOpen={() => {}} onBack={() => {}} onExpired={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Use 5% less electricity" })).toBeTruthy();
    expect(screen.getByText("About 31 kWh, or ~₱341 off your bill")).toBeTruthy();
    expect(screen.getByText("Your plan covers 5.0% · Goal reached")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByRole("button", { name: /Turn off the aircon 1 hour earlier.*−3\.0% · ~₱208/ })).toBeTruthy();
    expect(screen.getByText(/AI picks and words the missions/)).toBeTruthy();
  });

  it("Shuffle asks for another combination", async () => {
    render(<MissionPlan token="t" household={household} onOpen={() => {}} onBack={() => {}} onExpired={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Shuffle" }));
    expect(await screen.findByRole("button", { name: /Lights off in empty rooms/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Turn off the aircon/ })).toBeNull();
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith("/plan/shuffle") && init?.method === "POST")).toBe(true);
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
    expect(screen.getByText(/whole bill, not per mission/)).toBeTruthy();
    expect(screen.getByText("Based on assumptions")).toBeTruthy();
    expect(screen.getByText("Savings from heating up once (assumption): 0.2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remind me tonight" }));
    expect(screen.getByRole("button", { name: "Reminder set ✓" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Swap for a different mission" }));
    await vi.waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/iron-batch/swap"))).toBe(true);
  });
});
