import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SmartMeterUsage } from "../src/components/SmartMeterUsage";
import type { Household, UsageReadings } from "../src/api/client";

const household: Household = { sin: "9876543210", masked_address: "••• Quezon City", meter_type: "smart" };
const range = { from: "2026-11-01T16:00:00.000Z", to: "2026-11-03T16:00:00.000Z" };
const fixture = (patch: Partial<UsageReadings> = {}): UsageReadings => ({
  sin: household.sin, interval: "day", timeZone: "Asia/Manila", range, available: range,
  provenance: { kind: "synthetic", note: "Fixed test simulation." },
  readings: [
    { from: range.from, to: "2026-11-02T16:00:00.000Z", kwh: 12.345, partial: false },
    { from: "2026-11-02T16:00:00.000Z", to: range.to, kwh: 0.333, partial: true },
  ], ...patch,
});
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const expired = vi.fn();
const mount = () => render(<SmartMeterUsage token="session" household={household} onExpired={expired} />);
beforeEach(() => { fetchMock.mockReset(); expired.mockReset(); fetchMock.mockResolvedValue(response(fixture())); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("smart meter usage", () => {
  it("automatically loads the server's daily window with auth, no-store and a cancellation signal", async () => {
    mount();
    await screen.findByText("12.678 kWh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/households/${household.sin}/readings?interval=day`);
    expect(init?.headers).toEqual({ Authorization: "Bearer session" });
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(screen.getByText("Synthetic demo data, not real meter readings").getAttribute("title")).toBe("Fixed test simulation.");
    const chart = screen.getByRole("group", { name: /Daily usage chart in kWh/ });
    // No readings table: every bar names its exact value, shown visually as a tooltip.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("See the readings table")).toBeNull();
    expect(within(chart).getByRole("img", { name: "Mon, Nov 2, 2026: 12.345 kWh, complete" })).toBeTruthy();
    expect(within(chart).getByRole("img", { name: "Tue, Nov 3, 2026: 0.333 kWh, partial: some hours missing" })).toBeTruthy();
    expect(screen.getByText(/Striped: partial day, some hours are missing/)).toBeTruthy();
    // The shown window stays available on the caption without taking a line of its own.
    expect(screen.getByText(/last 30 days available/).closest("figcaption")!.getAttribute("title"))
      .toBe("Showing Nov 2, 2026, 12:00 AM – Nov 4, 2026, 12:00 AM of the simulation (Nov 2, 2026, 12:00 AM – Nov 4, 2026, 12:00 AM), Asia/Manila time.");
  });

  it.each([null, range])("handles empty readings with available=%j", async (available) => {
    fetchMock.mockResolvedValue(response(fixture({ available, range: available, readings: [] })));
    mount();
    await screen.findByText("No usage readings in this range yet.");
    expect(screen.queryByRole("group", { name: /usage chart/ })).toBeNull();
    expect(screen.queryByText(/total of the available/)).toBeNull();
    expect(screen.getByText(/Synthetic demo data/)).toBeTruthy();
    expect(screen.queryByText(/days available/)).toBeNull();
  });

  it("shows a loading state, then retries after a source error", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    mount();
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
    await act(async () => resolve(response({ error: "Source unavailable" }, 502)));
    expect(screen.getByRole("alert").textContent).toBe("Source unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry readings" }));
    await screen.findByText("12.678 kWh");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    mount();
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't get the smart meter readings. Please try again.");
  });

  it("expires the session on 401", async () => {
    fetchMock.mockResolvedValue(response({ error: "Expired" }, 401));
    mount();
    await waitFor(() => expect(expired).toHaveBeenCalledOnce());
    expect(screen.queryByRole("group", { name: /usage chart/ })).toBeNull();
  });

  it("aborts on unmount and ignores a delayed 401", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { unmount } = mount();
    const signal = fetchMock.mock.calls[0]![1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(response({ error: "Expired" }, 401)));
    expect(expired).not.toHaveBeenCalled();
  });

  it.each([
    { label: "Hour", interval: "hour", title: "Hourly", window: "24 hours", from: "2026-11-01T16:00:00Z", to: "2026-11-01T17:00:00Z", tick: "12 AM", period: "Nov 2, 2026, 12:00 AM – 1:00 AM" },
    { label: "Day", interval: "day", title: "Daily", window: "30 days", from: "2026-11-01T16:00:00Z", to: "2026-11-02T16:00:00Z", tick: "Nov 2", period: "Mon, Nov 2, 2026" },
    { label: "Week", interval: "week", title: "Weekly", window: "12 weeks", from: "2026-11-01T16:00:00Z", to: "2026-11-08T16:00:00Z", tick: "Nov 2", period: "Nov 2 – Nov 8, 2026" },
  ] as const)("requests the $interval preset and displays Manila labels and values", async ({ label, interval, title, window, from, to, tick, period }) => {
    fetchMock.mockImplementation(async (url) => {
      const requested = new URL(url, "http://localhost").searchParams.get("interval");
      return response(fixture({ interval: requested as UsageReadings["interval"], readings: [{ from, to, kwh: 0.123, partial: false }] }));
    });
    mount();
    await screen.findByRole("group", { name: /usage chart/ });
    fireEvent.click(screen.getByRole("button", { name: label }));
    const chart = await screen.findByRole("group", { name: new RegExp(`${title} usage chart`) });
    expect(chart.textContent).toContain(tick);
    expect(screen.getByText(new RegExp(window))).toBeTruthy();
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    const [url] = fetchMock.mock.calls.at(-1)!;
    // The server contract selects bounded windows from its advertised dates; never use the browser clock.
    expect(new URL(url, "http://localhost").searchParams.toString()).toBe(`interval=${interval}`);
    expect(screen.getByText("0.123 kWh")).toBeTruthy();
    fireEvent.mouseEnter(within(chart).getByRole("img", { name: `${period}: 0.123 kWh, complete` }));
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip.textContent).toBe(`${period}0.123 kWhComplete`);
  });

  it("ignores out-of-order intervals, including a stale 401, even when fetch ignores cancellation", async () => {
    const pending: { resolve: (r: Response) => void; signal: AbortSignal }[] = [];
    fetchMock.mockImplementation((_url, init) => new Promise((resolve) => pending.push({ resolve, signal: init!.signal! })));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Hour" }));
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(pending).toHaveLength(3);
    expect(pending[0]!.signal.aborted).toBe(true);
    expect(pending[1]!.signal.aborted).toBe(true);
    await act(async () => pending[2]!.resolve(response(fixture({ interval: "week" }))));
    await screen.findByRole("group", { name: /Weekly/ });
    await act(async () => {
      pending[0]!.resolve(response(fixture()));
      pending[1]!.resolve(response({ error: "Old session expired" }, 401));
    });
    expect(screen.getByRole("group", { name: /Weekly/ })).toBeTruthy();
    expect(expired).not.toHaveBeenCalled();
  });

  it("immediately removes the old chart on interval change and retries the selected interval", async () => {
    mount();
    await screen.findByText("12.678 kWh");
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.queryByRole("group", { name: /usage chart/ })).toBeNull();
    expect(screen.queryByText("12.678 kWh")).toBeNull();
    await act(async () => resolve(response({ error: "Try again" }, 502)));
    fetchMock.mockResolvedValue(response(fixture({ interval: "week" })));
    fireEvent.click(screen.getByRole("button", { name: "Retry readings" }));
    await screen.findByRole("group", { name: /Weekly/ });
    expect(fetchMock.mock.calls.at(-1)![0]).toContain("interval=week");
    expect(screen.getByRole("button", { name: "Week" }).getAttribute("aria-pressed")).toBe("true");
  });

  it.each([0, 0.001])("displays a single %s kWh partial week without inventing missing data", async (value) => {
    fetchMock.mockImplementation(async (url) => response(fixture({
      interval: new URL(url, "http://localhost").searchParams.get("interval") as UsageReadings["interval"],
      readings: [{ ...range, kwh: value, partial: true }],
    })));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    const chart = await screen.findByRole("group", { name: /Weekly/ });
    expect(chart.querySelectorAll(".meter-usage-bar")).toHaveLength(1);
    expect(chart.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getByText(`${value} kWh`)).toBeTruthy();
    expect(screen.getByText(/Striped: partial week/)).toBeTruthy();
    fireEvent.click(within(chart).getByRole("img"));
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip.textContent).toContain(`${value} kWh`);
    expect(tip.textContent).toContain("Partial: some hours missing");
  });
  it("shows the tooltip on hover, tap and keyboard focus; arrow keys move between bars and Esc hides it", async () => {
    mount();
    const chart = await screen.findByRole("group", { name: /Daily usage chart/ });
    const [first, second] = within(chart).getAllByRole("img");
    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
    // One tab stop for the whole chart.
    expect(first!.getAttribute("tabindex")).toBe("0");
    expect(second!.getAttribute("tabindex")).toBe("-1");

    fireEvent.mouseEnter(second!);
    expect(screen.getByRole("tooltip", { hidden: true }).textContent).toContain("0.333 kWh");
    fireEvent.mouseLeave(chart);
    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();

    fireEvent.click(first!);
    expect(screen.getByRole("tooltip", { hidden: true }).textContent).toContain("12.345 kWh");

    act(() => first!.focus());
    fireEvent.keyDown(first!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(second);
    expect(second!.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tooltip", { hidden: true }).textContent).toContain("0.333 kWh");
    fireEvent.keyDown(second!, { key: "ArrowRight" }); // stays on the last bar
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second!, { key: "Home" });
    expect(document.activeElement).toBe(first);
    // Leaving with the mouse keeps the focused bar's tooltip.
    fireEvent.mouseLeave(chart);
    expect(screen.getByRole("tooltip", { hidden: true }).textContent).toContain("12.345 kWh");
    fireEvent.keyDown(first!, { key: "Escape" });
    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  });
});
