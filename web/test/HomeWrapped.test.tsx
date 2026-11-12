import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeWrapped } from "../src/components/HomeWrapped";
import type { HomeChargeLine, HomeSummary } from "../src/api/client";

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
let data = summary();
const respond = (body: HomeSummary) => { data = body; };

beforeEach(() => { data = summary(); });
afterEach(() => { cleanup(); });

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
const slide = () => screen.getByRole("group");

describe("Your bill, wrapped (opened from Home)", () => {
  it("opens on the amount due, then the change vs. last month", async () => {
    render(<HomeWrapped data={data} />);
    expect(await screen.findByRole("heading", { name: "Your October bill, wrapped" })).toBeTruthy();
    expect(screen.getByLabelText("Amount due ₱6,817.00").textContent).toBe("₱6,817.00");
    expect(slide().textContent).toContain("Due Nov 24 · CAN 39•• ••• 482");
    expect(screen.getByText("1 / 5")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous slide" }) as HTMLButtonElement).disabled).toBe(true);
    next();
    expect(screen.getByRole("heading", { name: "You paid ₱937.00 more than in September." })).toBeTruthy();
    expect(screen.getByLabelText("+₱937.00 vs. September").textContent).toBe("+₱937.00");
  });

  it("ranks what moved the bill, biggest first, and says it adds up", async () => {
    render(<HomeWrapped data={data} />);
    await screen.findByRole("heading", { name: /wrapped/ });
    next(); next();
    expect(screen.getByRole("heading", { name: "#1: Household usage added ₱577.00." })).toBeTruthy();
    const ranked = within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent);
    expect(ranked).toEqual(["1Household usage+₱577.00", "2Rate+₱148.00", "3Hotter weather+₱112.00", "4Billing days+₱100.00"]);
    expect(screen.getByText("✓ Adds up to +₱937.00")).toBeTruthy();
  });

  it("every charge opens the charge chat, System loss included; View all lists every line", async () => {
    const onAsk = vi.fn();
    render(<HomeWrapped data={data} onAskCharge={onAsk} />);
    await screen.findByRole("heading", { name: /wrapped/ });
    fireEvent.click(screen.getByRole("tab", { name: "Slide 4: Where your money went" }));
    const systemLoss = screen.getByRole("button", { name: /^System loss: ₱410\.00, \+₱45\.00 vs\. last month, Pass-through/ });
    fireEvent.click(systemLoss);
    expect(onAsk.mock.calls[0]![0].id).toBe("system_loss");
    // Top charges are ranked by amount.
    expect(screen.getAllByRole("button", { name: /Ask about this charge/ }).map((b) => b.getAttribute("aria-label")!.split(":")[0]))
      .toEqual(["Generation", "Distribution", "Taxes", "Transmission", "System loss"]);
    fireEvent.click(screen.getByRole("button", { name: "View all 7 charges" }));
    const all = screen.getByLabelText("All charges");
    expect(within(all).getAllByRole("button")).toHaveLength(7);
    fireEvent.click(within(all).getByRole("button", { name: /^Mystery:/ }));
    expect(onAsk.mock.calls[1]![0].id).toBe("other-x");
  });

  it("the last slide's save card opens rewards onboarding, or shows the plan summary once set up", async () => {
    const onSave = vi.fn();
    const { unmount } = render(<HomeWrapped data={data} onSave={onSave} />);
    await screen.findByRole("heading", { name: /wrapped/ });
    fireEvent.keyDown(screen.getByRole("region", { name: "Your bill, wrapped" }), { key: "ArrowRight" });
    expect(screen.getByText("2 / 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Slide 5: Your next move" }));
    expect(screen.getByRole("heading", { name: "₱577.00 came from how you used power. Win it back next month." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Want to save on your next bill\?.*₱577\.00 came from usage/ }));
    expect(onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByText("1 / 5")).toBeTruthy();
    unmount();
    render(<HomeWrapped data={data} saveCard={<p>Mission Plan: 5% less</p>} />);
    await screen.findByRole("heading", { name: /wrapped/ });
    fireEvent.click(screen.getByRole("tab", { name: "Slide 5: Your next move" }));
    expect(screen.getByText("Mission Plan: 5% less")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Want to save/ })).toBeNull();
  });

  it("no Ask Meralco, bill checks or badge, even when checks fail", async () => {
    respond(summary({
      badge: { status: "red", label: "Something doesn't match" },
      tamaBa: { status: "red", label: "Something doesn't match", failedChecks: 1, summary: "Total ₱3,000 vs lines ₱2,690", screen: "tama-ba" },
      action: { kind: "askMeralco", label: "Ask Meralco", screen: "tama-ba", summary: "Total ₱3,000 vs lines ₱2,690" },
    }));
    render(<HomeWrapped data={data} />);
    await screen.findByRole("heading", { name: /wrapped/ });
    expect(document.body.textContent).not.toMatch(/Ask Meralco|Something doesn't match|Bill verified/);
  });

  it("a lower bill says how much less, without a minus sign in the sentence", async () => {
    const base = summary().bakitGanito!;
    respond(summary({ bakitGanito: { ...base, total: -59500, habit: -60600, effects: [{ key: "rate", label: "Rate Effect", amount: 1100 }, { key: "habit", label: "Habit Effect", amount: -60600 }] } }));
    render(<HomeWrapped data={data} />);
    await screen.findByRole("heading", { name: /wrapped/ });
    next();
    expect(screen.getByRole("heading", { name: "You paid ₱595.00 less than in September." })).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "#1: Household usage saved you ₱606.00." })).toBeTruthy();
  });

  it("without last month to compare, says so and skips the reasons", async () => {
    respond(summary({ bakitGanito: null, bakitGanitoUnavailable: "Two Bills are needed to compare." }));
    render(<HomeWrapped data={data} />);
    await screen.findByRole("heading", { name: /wrapped/ });
    expect(screen.getByText("1 / 4")).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "Two Bills are needed to compare." })).toBeTruthy();
  });
});

describe("closing the story", () => {
  it("× and Escape close it", () => {
    const onClose = vi.fn();
    render(<HomeWrapped data={summary()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(screen.getByRole("region", { name: "Your bill, wrapped" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
