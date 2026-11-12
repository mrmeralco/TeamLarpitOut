import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "../src/components/Home";
import type { HomeSummary, MissionPlan, SetupStatus } from "../src/api/client";

const household = { sin: "1234567890", masked_address: "••• Caloocan City", meter_type: "traditional" as const };
const summary = (over: Partial<HomeSummary> = {}): HomeSummary => ({
  meterType: "traditional", canMasked: "39•• ••• 482", area: "Caloocan City",
  chargeLines: { featured: [], all: [] },
  bill: { period: "2026-10", amountDue: 681700, dueDate: "2026-11-24", billDate: null },
  badge: { status: "green", label: "Bill verified" },
  bakitGanito: {
    sentence: "", total: 93700, screen: "bakit-ganito", previousPeriod: "2026-09", addsUp: true, habit: 57700, lines: [],
    effects: [
      { key: "rate", label: "Rate Effect", amount: 14800 }, { key: "billingDays", label: "Billing Days Effect", amount: 10000 },
      { key: "weather", label: "Weather Effect", amount: 11200 }, { key: "habit", label: "Habit Effect", amount: 57700 },
    ],
  },
  bakitGanitoUnavailable: null,
  tamaBa: { status: "green", label: "Bill verified", failedChecks: 0, summary: "OK", screen: "tama-ba" },
  action: { kind: "missions", label: "See Missions", screen: "missions" },
  smartMeter: null,
  ...over,
});
const setupStatus = (done: boolean[]): SetupStatus => ({
  steps: [
    { key: "household", label: "Household info", done: done[0]! },
    { key: "appliances", label: "Appliances", done: done[1]! },
    { key: "routine", label: "Typical day", done: done[2]! },
  ],
  doneCount: done.filter(Boolean).length, total: 3, complete: done.every(Boolean),
  household: null, routine: null, hasAircon: true, welcomePoints: { points: 100, granted: false, locked: true },
});
const plan: MissionPlan = {
  period: "2026-11", goal: { cut: 5, kwh: 31, pesos: 34100, baselineKwh: 620, targetKwh: 589, targetPesos: 600000 }, covered: 1, coveredPercent: 5,
  source: "fallback", points: "",
  missions: [
    { id: "aircon-off-1h", title: "Turn off the aircon 1 hour earlier", why: "", how: [], appliance: "aircon", kwhSaved: 18.6, pesoValue: 20800, percent: 3, share: 0.6, effort: "Easy", basis: "physics", assumptions: [] },
    { id: "unplug", title: "Unplug chargers at night", why: "", how: [], appliance: "other", kwhSaved: 12.4, pesoValue: 13300, percent: 2, share: 0.4, effort: "Easy", basis: "physics", assumptions: [] },
  ],
};
const usage = [
  { period: "2026-08", kwh: 560, billingDays: 31, provenance: { kind: "generated", note: "" } },
  { period: "2026-09", kwh: 590, billingDays: 30, provenance: { kind: "generated", note: "" } },
  { period: "2026-10", kwh: 610, billingDays: 33, provenance: { kind: "scanned", note: "" } },
];
let home: HomeSummary;
const fetchMock = vi.fn(async (input: string) => {
  if (input.endsWith("/home")) return new Response(JSON.stringify(home));
  if (input.endsWith("/bills")) return new Response(JSON.stringify(usage));
  if (input.endsWith("/missions/plan")) return new Response(JSON.stringify(plan));
  throw new Error(`Unexpected ${input}`);
});

beforeEach(() => { home = summary(); fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Home: gamified with Eelio", () => {
  it("the hero shows the bill, the change and Eelio's title and charge", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} setup={setupStatus([true, true, true])} />);
    expect(await screen.findByRole("heading", { name: "Your October bill" })).toBeTruthy();
    expect(screen.getByText("₱6,817")).toBeTruthy();
    expect(screen.getByText(/▲ ₱937 vs\. September/)).toBeTruthy();
    // Usage went up and setup is done: Eelio is the Bill Detective.
    expect(screen.getByRole("img", { name: "Eelio, Bill Detective" })).toBeTruthy();
    expect(screen.getByText("Bill Detective")).toBeTruthy();
    // 3 setup steps × 20 + active plan 20 = 80.
    expect(await screen.findByRole("meter", { name: "Eelio's charge" })).toBeTruthy();
    expect((await screen.findByText("80% charged"))).toBeTruthy();
  });

  it("Eelio's mood follows the household: Fully Charged when usage went down, Low Battery while setup is unfinished", async () => {
    home = summary({ bakitGanito: { ...summary().bakitGanito!, total: -59500, habit: -60600 } });
    const { unmount } = render(<Home token="t" household={household} onExpired={() => {}} setup={setupStatus([false, false, false])} />);
    expect(await screen.findByRole("img", { name: "Eelio, Fully Charged" })).toBeTruthy();
    expect(screen.getByText("20% charged")).toBeTruthy();
    unmount();
    home = summary();
    render(<Home token="t" household={household} onExpired={() => {}} setup={setupStatus([true, false, false])} />);
    expect(await screen.findByRole("img", { name: "Eelio, Low Battery" })).toBeTruthy();
    expect(screen.getByText("20% charged")).toBeTruthy();
  });

  it("three star skills come from the bill's effects and setup", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} setup={setupStatus([true, false, false])} />);
    await screen.findByRole("heading", { name: "Your October bill" });
    const skills = within(screen.getByRole("list", { name: "Your energy skills" }));
    // Habit +₱577 of a ₱5,880 bill (~10%) → 2 stars; weather +₱112 (~2%) → 3; 1 setup step → 2.
    expect(skills.getByRole("img", { name: "Usage control: 2 of 5 stars" })).toBeTruthy();
    expect(skills.getByRole("img", { name: "Weather-proof: 3 of 5 stars" })).toBeTruthy();
    expect(skills.getByRole("img", { name: "Mission ready: 2 of 5 stars" })).toBeTruthy();
  });

  it("charts kWh per month and says when earlier months are samples", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} />);
    expect(await screen.findByRole("img", { name: /kWh per month, August to October\. Latest 610 kWh/ })).toBeTruthy();
    expect(screen.getByText("Earlier months are sample values.")).toBeTruthy();
  });

  it("before setup the missions list is the setup steps; the save card starts onboarding", async () => {
    const onSave = vi.fn();
    render(<Home token="t" household={household} onExpired={() => {}} onSave={onSave} setup={setupStatus([true, false, false])} />);
    await screen.findByRole("heading", { name: "Your October bill" });
    const side = within(screen.getByRole("complementary", { name: "Your missions" }));
    expect(side.getByRole("img", { name: "Household info: 100%" })).toBeTruthy();
    expect(side.getByRole("img", { name: "Appliances: 0%" })).toBeTruthy();
    fireEvent.click(side.getByRole("button", { name: /Want to save on your next bill\?.*₱577 came from usage/ }));
    expect(onSave).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/missions/plan"))).toBe(false);
  });

  it("after setup the missions show progress rings toward the 5% goal and open their detail", async () => {
    const onOpen = vi.fn();
    render(<Home token="t" household={household} onExpired={() => {}} onOpenMission={onOpen} setup={setupStatus([true, true, true])}
      saveCard={<p>Your plan: use 5% less electricity</p>} />);
    const ring = await screen.findByRole("img", { name: "Turn off the aircon 1 hour earlier, share of your 5% goal: 60%" });
    expect(screen.getByText("Your plan: use 5% less electricity")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Want to save/ })).toBeNull();
    fireEvent.click(ring.closest("button")!);
    expect(onOpen).toHaveBeenCalledWith("aircon-off-1h");
  });

  it("'Play your bill wrapped' opens the story over Home; × closes it", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Play your bill wrapped" }));
    const dialog = screen.getByRole("dialog", { name: "Your bill, wrapped" });
    expect(within(dialog).getByRole("heading", { name: "Your October bill, wrapped" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("no Ask Meralco, bill checks or badge on Home", async () => {
    home = summary({
      badge: { status: "red", label: "Something doesn't match" },
      action: { kind: "askMeralco", label: "Ask Meralco", screen: "tama-ba", summary: "Total ₱3,000 vs lines ₱2,690" },
    });
    render(<Home token="t" household={household} onExpired={() => {}} />);
    await screen.findByRole("heading", { name: "Your October bill" });
    expect(document.body.textContent).not.toMatch(/Ask Meralco|Something doesn't match|Bill verified/);
  });
});
