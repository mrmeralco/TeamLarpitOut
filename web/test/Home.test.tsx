import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "../src/components/Home";
import type { HomeChargeLine, HomeSummary } from "../src/api/client";

const household = { sin: "1234567890", masked_address: "••• Caloocan City", meter_type: "traditional" as const };
const line = (id: string, label: string, amount: number, change: number | null, goesTo: string | null): HomeChargeLine => ({
  id, label, amount, previous: change === null ? null : amount - change, change, kind: "perKwh", payee: null, goesTo, printed: [label],
});
const featured = [
  line("generation", "Generation", 342000, 41000, "Pass-through"),
  line("distribution", "Distribution", 121000, 16000, "Meralco"),
  line("system_loss", "System loss", 41000, 4500, "Pass-through"),
  line("transmission", "Transmission", 59000, 6200, "Pass-through"),
  line("taxes", "Taxes", 78000, 12000, "Government"),
];
const summary = (over: Partial<HomeSummary> = {}): HomeSummary => ({
  meterType: "traditional", canMasked: "39•• ••• 482", area: "Caloocan City",
  chargeLines: { featured, all: [...featured, line("supply", "Supply", 1638, 0, "Meralco"), line("other-x", "Mystery", 500, null, null)] },
  bill: { period: "2026-10", amountDue: 681700, dueDate: "2026-11-24", billDate: null },
  badge: { status: "green", label: "Bill verified" },
  bakitGanito: {
    sentence: "Tumaas.", total: 93700, screen: "bakit-ganito", previousPeriod: "2026-09", addsUp: true, habit: 57700, lines: [],
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
const respond = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

beforeEach(() => respond(summary()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Home tab", () => {
  it("shows the amount due, the change vs. last month and four effects that add up", async () => {
    render(<Home token="t" household={household} onExpired={() => {}} />);
    expect(await screen.findByText("₱6,817")).toBeTruthy();
    expect(screen.getByText("October bill · due Nov 24")).toBeTruthy();
    expect(screen.getByText("vs. September")).toBeTruthy();
    expect(screen.getByText("+₱937")).toBeTruthy();
    const tiles = within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent);
    expect(tiles).toEqual(["Rate+₱148", "Billing days+₱100", "Hotter weather+₱112", "Household usage+₱577"]);
    expect(screen.getByText("✓ Adds up: +₱937.00")).toBeTruthy();
    expect(screen.getByText(/CAN 39•• ••• 482/)).toBeTruthy();
  });

  it("makes every charge line a button for the charge chat, System loss included; View all lists every line", async () => {
    const onAsk = vi.fn();
    render(<Home token="t" household={household} onExpired={() => {}} onAskCharge={onAsk} />);
    const systemLoss = await screen.findByRole("button", { name: /^System loss: ₱410\.00, \+₱45\.00 vs\. last month, Pass-through/ });
    fireEvent.click(systemLoss);
    expect(onAsk.mock.calls[0]![0].id).toBe("system_loss");
    for (const l of ["Generation", "Distribution", "Transmission", "Taxes"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${l}:`) })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: /View all 7/ }));
    const all = screen.getByLabelText("All charges");
    expect(within(all).getAllByRole("button")).toHaveLength(7);
    fireEvent.click(within(all).getByRole("button", { name: /^Mystery:/ }));
    expect(onAsk.mock.calls[1]![0].id).toBe("other-x");
  });

  it("moves 'Ask Meralco' and the copyable summary to the top on a red badge", async () => {
    respond(summary({
      badge: { status: "red", label: "Something doesn't match" },
      tamaBa: { status: "red", label: "Something doesn't match", failedChecks: 1, summary: "Total ₱3,000 vs lines ₱2,690", screen: "tama-ba" },
      action: { kind: "askMeralco", label: "Ask Meralco", screen: "tama-ba", summary: "Total ₱3,000 vs lines ₱2,690" },
    }));
    render(<Home token="t" household={household} onExpired={() => {}} />);
    const ask = await screen.findByRole("alert");
    expect(ask.textContent).toContain("Ask Meralco");
    expect(ask.textContent).toContain("Total ₱3,000 vs lines ₱2,690");
    const order = [...document.querySelectorAll(".home2 > *")].map((el) => el.className);
    expect(order.indexOf("card home-ask")).toBeLessThan(order.indexOf("card home-due"));
    expect(within(ask).getByRole("button", { name: "Copy summary" })).toBeTruthy();
  });

  it("the save card opens rewards onboarding with the Habit Effect, or shows the plan summary once set up", async () => {
    const onSave = vi.fn();
    const { unmount } = render(<Home token="t" household={household} onExpired={() => {}} onSave={onSave} />);
    fireEvent.click(await screen.findByRole("button", { name: /Want to save on your next bill\?.*₱577 came from usage/ }));
    expect(onSave).toHaveBeenCalled();
    unmount();
    render(<Home token="t" household={household} onExpired={() => {}} saveCard={<p>Mission Plan: 5% less</p>} />);
    expect(await screen.findByText("Mission Plan: 5% less")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Want to save/ })).toBeNull();
  });
});
