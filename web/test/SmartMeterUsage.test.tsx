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
    expect(screen.getByText(/Synthetic demo data/).textContent).toContain("Fixed test simulation.");
    expect(screen.getByRole("img", { name: /Daily usage chart in kWh/ })).toBeTruthy();
    fireEvent.click(screen.getByText("See the readings table"));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("cell", { name: "12.345" })).toBeTruthy();
    expect(within(table).getByRole("cell", { name: "Partial" })).toBeTruthy();
    expect(within(table).getByRole("rowheader", { name: /Nov 2, 2026, 12:00 AM/ })).toBeTruthy();
    expect(screen.getByText(/Partial: some hours are missing/)).toBeTruthy();
  });

  it.each([null, range])("handles empty readings with available=%j", async (available) => {
    fetchMock.mockResolvedValue(response(fixture({ available, range: available, readings: [] })));
    mount();
    await screen.findByText("No usage readings in this range yet.");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(/total of the available/)).toBeNull();
    expect(screen.getByText(/Synthetic demo data/)).toBeTruthy();
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
    expect(screen.queryByRole("img")).toBeNull();
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
    { label: "Hour", interval: "hour", title: "Hourly", window: "24 hours", from: "2026-11-01T16:00:00Z", to: "2026-11-01T17:00:00Z", tick: "12:00 AM" },
    { label: "Day", interval: "day", title: "Daily", window: "30 days", from: "2026-11-01T16:00:00Z", to: "2026-11-02T16:00:00Z", tick: "Nov 2" },
    { label: "Week", interval: "week", title: "Weekly", window: "12 weeks", from: "2026-11-01T16:00:00Z", to: "2026-11-08T16:00:00Z", tick: "Nov 2" },
  ] as const)("requests the $interval preset and displays Manila labels and values", async ({ label, interval, title, window, from, to, tick }) => {
    fetchMock.mockImplementation(async (url) => {
      const requested = new URL(url, "http://localhost").searchParams.get("interval");
      return response(fixture({ interval: requested as UsageReadings["interval"], readings: [{ from, to, kwh: 0.123, partial: false }] }));
    });
    mount();
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: label }));
    const chart = await screen.findByRole("img", { name: new RegExp(`${title} usage chart`) });
    expect(chart.textContent).toContain(tick);
    expect(screen.getByText(new RegExp(window))).toBeTruthy();
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    const [url] = fetchMock.mock.calls.at(-1)!;
    // The server contract selects bounded windows from its advertised dates; never use the browser clock.
    expect(new URL(url, "http://localhost").searchParams.toString()).toBe(`interval=${interval}`);
    expect(screen.getByText("0.123 kWh")).toBeTruthy();
    fireEvent.click(screen.getByText("See the readings table"));
    expect(screen.getByRole("rowheader").textContent).toContain("Nov 2, 2026, 12:00 AM");
    expect(screen.getByRole("cell", { name: "0.123" })).toBeTruthy();
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
    await screen.findByRole("img", { name: /Weekly/ });
    await act(async () => {
      pending[0]!.resolve(response(fixture()));
      pending[1]!.resolve(response({ error: "Old session expired" }, 401));
    });
    expect(screen.getByRole("img", { name: /Weekly/ })).toBeTruthy();
    expect(expired).not.toHaveBeenCalled();
  });

  it("immediately removes the old chart on interval change and retries the selected interval", async () => {
    mount();
    await screen.findByText("12.678 kWh");
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("12.678 kWh")).toBeNull();
    await act(async () => resolve(response({ error: "Try again" }, 502)));
    fetchMock.mockResolvedValue(response(fixture({ interval: "week" })));
    fireEvent.click(screen.getByRole("button", { name: "Retry readings" }));
    await screen.findByRole("img", { name: /Weekly/ });
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
    const chart = await screen.findByRole("img", { name: /Weekly/ });
    expect(chart.querySelectorAll("rect")).toHaveLength(1);
    expect(chart.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getByText(`${value} kWh`)).toBeTruthy();
    expect(screen.getByText(/Not a full week/)).toBeTruthy();
    fireEvent.click(screen.getByText("See the readings table"));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("cell", { name: String(value) })).toBeTruthy();
  });
});
