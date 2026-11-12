import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPlanCache } from "../src/components/MissionPlan";
import { clearHomeCache, Home } from "../src/components/Home";
import type { ApplianceBreakdown, HomeChargeLine, HomeSummary, MissionPlan, SetupStatus } from "../src/api/client";

const household = { sin: "1234567890", masked_address: "••• Caloocan City", meter_type: "traditional" as const };
const line = (id: string, label: string, amount: number, change: number | null, goesTo: string | null): HomeChargeLine => ({
  id, label, amount, previous: change === null ? null : amount - change, change, kind: "perKwh", payee: null, goesTo, printed: [label],
});
const lines = [
  line("generation", "Generation", 342000, 41000, "Pass-through"),
  line("distribution", "Distribution", 121000, -16000, "Meralco"),
  line("taxes", "Taxes", 78000, null, "Government"),
  line("transmission", "Transmission", 59000, 6200, "Pass-through"),
  line("senior", "Senior citizen", 0, null, "Subsidy"), // ₱0.00 shows as ₱0, so it is folded away
];
const summary = (over: Partial<HomeSummary> = {}): HomeSummary => ({
  meterType: "traditional", canMasked: "39•• ••• 482", area: "Caloocan City",
  chargeLines: { featured: lines.slice(0, 4), all: lines },
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
  source: "fallback", points: "", rewardPoints: 341,
  missions: [
    { id: "aircon-off-1h", title: "Turn off the aircon 1 hour earlier", why: "", how: [], appliance: "aircon", kwhSaved: 18.6, pesoValue: 20800, percent: 3, share: 0.6, rewardPoints: 208, effort: "Easy", basis: "physics", assumptions: [] },
    { id: "unplug", title: "Unplug chargers at night", why: "", how: [], appliance: "other", kwhSaved: 12.4, pesoValue: 13300, percent: 2, share: 0.4, rewardPoints: 133, effort: "Easy", basis: "physics", assumptions: [] },
  ],
};
const usage = [
  { period: "2026-08", kwh: 560, billingDays: 31, provenance: { kind: "generated", note: "" } },
  { period: "2026-09", kwh: 590, billingDays: 30, provenance: { kind: "generated", note: "" } },
  { period: "2026-10", kwh: 610, billingDays: 33, provenance: { kind: "scanned", note: "" } },
];
const breakdown: ApplianceBreakdown = {
  bill: { period: "2026-10", kwh: 610, billingDays: 33 },
  rows: [
    { index: 0, type: "refrigerator", label: "Refrigerator", quantity: 1, source: "default", sourceLabel: "Typical value", kwh: 120, pesos: 140000, share: 0.2 },
    { index: 1, type: "aircon", label: "Aircon", quantity: 1, source: "default", sourceLabel: "Typical value", kwh: 450, pesos: 520000, share: 0.74 },
    { index: 2, type: "electric_fan", label: "Electric fan", quantity: 2, source: "default", sourceLabel: "Typical value", kwh: 40, pesos: 46000, share: 0.06 },
  ],
  totals: { kwh: 610, perKwhCharges: 0, fixedCharges: 0 },
};
let home: HomeSummary;
const fetchMock = vi.fn(async (input: string) => {
  if (input.endsWith("/home")) return new Response(JSON.stringify(home));
  if (input.endsWith("/bills")) return new Response(JSON.stringify(usage));
  if (input.endsWith("/missions/plan")) return new Response(JSON.stringify(plan));
  if (input.endsWith("/appliances/breakdown")) return new Response(JSON.stringify(breakdown));
  throw new Error(`Unexpected ${input}`);
});

beforeEach(() => { home = summary(); fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearPlanCache(); clearHomeCache(); });

describe("Home: gamified with Eelio", () => {
  it("coming back to Home shows the last bill at once and refreshes it in the background", async () => {
    const first = render(<Home token="t" household={household} onExpired={() => {}} />);
    expect(screen.getByText(/Eelio is reading your bill/)).toBeTruthy();
    expect(first.container.querySelector('.eelio-loader img[src="/mascot/eelio-swim-1.png"]')).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Your October bill" })).toBeTruthy();
    first.unmount();
    const calls = fetchMock.mock.calls.length;
    render(<Home token="t" household={household} onExpired={() => {}} />);
    expect(screen.queryByText(/Eelio is reading your bill/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Your October bill" })).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it("the hero shows the bill, the change and Eelio's title and charge", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} setup={setupStatus([true, true, true])} />);
    expect(await screen.findByRole("heading", { name: "Your October bill" })).toBeTruthy();
    expect(screen.getByText("₱6,817.00")).toBeTruthy();
    expect(screen.getByText(/▲ ₱937\.00 vs\. September/)).toBeTruthy();
    // Usage went up and setup is done: Eelio is the Bill Detective.
    expect(screen.getByRole("img", { name: "Eelio, Bill Detective" })).toBeTruthy();
    expect(screen.getByText("Bill Detective")).toBeTruthy();
    // 3 setup steps × 20 + active plan 20 = 80.
    expect(await screen.findByRole("meter", { name: "Eelio's charge" })).toBeTruthy();
    expect((await screen.findByText("80% charged"))).toBeTruthy();
  });

  it("Eelio's mood follows the household: Fully Charged when usage went down, Bill Detective otherwise (always active, never low battery)", async () => {
    home = summary({ bakitGanito: { ...summary().bakitGanito!, total: -59500, habit: -60600 } });
    const { unmount } = render(<Home token="t" household={household} onExpired={() => {}} setup={setupStatus([false, false, false])} />);
    expect(await screen.findByRole("img", { name: "Eelio, Fully Charged" })).toBeTruthy();
    expect(screen.getByText("20% charged")).toBeTruthy();
    unmount();
    home = summary();
    render(<Home token="t" household={household} onExpired={() => {}} setup={setupStatus([true, false, false])} />);
    expect(await screen.findByRole("img", { name: "Eelio, Bill Detective" })).toBeTruthy();
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

  it("shows the last 12 bills' kWh as bars with the average, and says when earlier months are samples", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} />);
    expect(await screen.findByRole("img", { name: "kWh per bill, August to October. Latest 610 kWh; 3-month average 587 kWh." })).toBeTruthy();
    expect(screen.getByText("610 kWh")).toBeTruthy();
    expect(screen.getByText(/Earlier months are sample values\./)).toBeTruthy();
  });

  it("the side breaks down Meralco's charges by who gets the money; every charge opens the charge chat", async () => {
    const onAsk = vi.fn();
    render(<Home token="t" household={household} onExpired={() => {}} onAskCharge={onAsk} />);
    await screen.findByRole("heading", { name: "Your October bill" });
    const side = within(screen.getByRole("region", { name: "Your bill's charges" }));
    expect(side.getByRole("img", { name: "Pass-through 67%, Meralco 20%, Government 13%" })).toBeTruthy();
    const rows = side.getAllByRole("button", { name: /Ask about this charge/ }).map((b) => b.getAttribute("aria-label")!.split(":")[0]);
    expect(rows).toEqual(["Generation", "Distribution", "Taxes", "Transmission"]);
    expect(side.getByText("+1 more charge at ₱0 on this bill.")).toBeTruthy();
    fireEvent.click(side.getByRole("button", { name: /^Distribution: ₱1,210\.00, −₱160\.00 vs\. last month, Meralco/ }));
    expect(onAsk.mock.calls[0]![0].id).toBe("distribution");
  });

  it("shows every charge as a tile across the page, biggest first, with the usage chart on the side", async () => {
    const more = [...lines, line("supply", "Supply", 15200, 700, "Meralco"), line("metering", "Metering", 9600, null, "Meralco")];
    home = summary({ chargeLines: { featured: more.slice(0, 4), all: more } });
    render(<Home token="t" household={household} onExpired={() => {}} />);
    const charges = await screen.findByRole("region", { name: "Your bill's charges" });
    expect(charges.closest(".dash-wide")).toBeTruthy();
    const asks = within(charges).getAllByRole("button", { name: /Ask about this charge/ }).map((b) => b.getAttribute("aria-label")!.split(":")[0]);
    expect(asks).toEqual(["Generation", "Distribution", "Taxes", "Transmission", "Supply", "Metering"]);
    expect(within(charges).getByRole("button", { name: /^Generation:.*Biggest charge\./ })).toBeTruthy();
    const side = within(screen.getByRole("complementary", { name: "Your usage and savings" }));
    expect(side.getByRole("heading", { name: "Your usage" })).toBeTruthy();
  });

  it("groups the charge tiles by 4 for swiping on phones, with a pager", async () => {
    const more = [...lines, line("supply", "Supply", 15200, 700, "Meralco"), line("metering", "Metering", 9600, null, "Meralco")];
    home = summary({ chargeLines: { featured: more.slice(0, 4), all: more } });
    const onAsk = vi.fn();
    render(<Home token="t" household={household} onExpired={() => {}} onAskCharge={onAsk} />);
    const charges = within(await screen.findByRole("region", { name: "Your bill's charges" }));
    const groups = charges.getAllByRole("list").filter((el) => el.classList.contains("charge-page"));
    expect(groups.map((g) => within(g).getAllByRole("button").length)).toEqual([4, 2]);
    expect(charges.getByRole("button", { name: "Show charges group 1 of 2" }).getAttribute("aria-current")).toBe("true");
    fireEvent.click(charges.getByRole("button", { name: "Show charges group 2 of 2" }));
    expect(charges.getByRole("button", { name: "Show charges group 2 of 2" }).getAttribute("aria-current")).toBe("true");
    fireEvent.click(within(groups[1]!).getByRole("button", { name: /^Metering:/ }));
    expect(onAsk.mock.calls[0]![0].id).toBe("metering");
  });

  it("before setup: no 'Want to save?' card and no appliances card", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} onSave={() => {}} setup={setupStatus([true, false, false])} />);
    await screen.findByRole("heading", { name: "Your October bill" });
    expect(screen.queryByRole("button", { name: /Want to save on your next bill/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Your appliances" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/appliances/breakdown") || url.endsWith("/missions/plan"))).toBe(false);
  });

  it("once the appliances are set up, shows where the bill's kWh went by appliance, biggest first", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} setup={setupStatus([true, true, false])}
      saveCard={<p>Your plan: use 5% less electricity</p>} />);
    expect(await screen.findByRole("heading", { name: "Your appliances" })).toBeTruthy();
    const names = [...document.querySelectorAll(".appliance-name strong")].map((el) => el.textContent);
    expect(names).toEqual(["Aircon", "Refrigerator", "Electric fan ×2"]);
    expect(screen.getByText("74%")).toBeTruthy();
    expect(screen.getByText("450 kWh · ₱5,200.00")).toBeTruthy();
    expect(screen.getByText("Your plan: use 5% less electricity")).toBeTruthy();
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
