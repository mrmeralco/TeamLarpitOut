import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { SetupAppliances } from "../src/components/SetupAppliances";
import { SetupRoutine } from "../src/components/SetupRoutine";
import type { SetupStatus } from "../src/api/client";

const tiles = ["aircon", "refrigerator", "electric_fan", "tv", "washing_machine", "rice_cooker", "flat_iron", "computer", "other"].map((type) => ({
  type, label: type === "aircon" ? "Aircon" : type === "refrigerator" ? "Refrigerator" : type === "electric_fan" ? "Electric fan" : type,
  kwh: 1, unit: "kWh per hour", tag: "Typical value" as const,
}));
const status = (over: Partial<SetupStatus> = {}): SetupStatus => ({
  steps: [{ key: "household", label: "", done: true }, { key: "appliances", label: "", done: false }, { key: "routine", label: "", done: false }],
  doneCount: 1, total: 3, complete: false, household: { size: 4 }, routine: null, hasAircon: false, grid: null, gridCatalog: tiles,
  welcomePoints: { points: 100, granted: false, locked: false }, ...over,
});
const response = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
let photoReply: unknown;

beforeEach(() => {
  photoReply = { type: "aircon", label: "Aircon", answers: { mount: "split", inverter: "yes", room: "large" }, kwh: 1.12, unit: "kWh per hour", tag: "Estimated from photo" };
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith("/setup/appliances")) return response(status({ grid: JSON.parse(String(init!.body)).counts }));
    if (input.endsWith("/setup/appliance-photo")) return response(photoReply);
    if (input.includes("/setup/aircon-check")) return response({ source: "bills", available: true, chosenHours: 8, estimatedHours: 8, agrees: true, message: "Your 12 bills agree: about 8 hours a day." });
    if (input.endsWith("/setup/routine")) return response(status({ complete: true }));
    throw new Error(`Unexpected ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Setup tap grid", () => {
  it("tap adds one, tap again adds a second, long-press removes; saves only the counts", async () => {
    const onSaved = vi.fn();
    render(<SetupAppliances token="t" sin="1234567890" status={status()} onSaved={onSaved} onBack={() => {}} onExpired={() => {}} />);
    expect(screen.getAllByText("Typical value")).toHaveLength(9);
    const fan = screen.getByRole("button", { name: /^Electric fan\. Tap to add/ });
    fireEvent.click(fan);
    fireEvent.click(screen.getByRole("button", { name: /^Electric fan, 1\./ }));
    expect(screen.getByRole("button", { name: /^Electric fan, 2\./ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Refrigerator\. Tap to add/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Aircon\. Tap to add/ }));
    vi.useFakeTimers();
    const aircon = screen.getByRole("button", { name: /^Aircon, 1\./ });
    fireEvent.pointerDown(aircon);
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerUp(aircon);
    fireEvent.click(aircon);
    vi.useRealTimers();
    expect(screen.getByRole("button", { name: /^Aircon\. Tap to add/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue · 3 appliances" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    const put = fetchMock.mock.calls.find(([url]) => url.endsWith("/setup/appliances"))!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ counts: { electric_fan: 2, refrigerator: 1 } });
    expect(document.body.textContent).not.toMatch(/watt|model/i);
  });

  it("has a visible remove button as the accessible alternative to long-press", () => {
    render(<SetupAppliances token="t" sin="1234567890" status={status({ grid: { tv: 2 } })} onSaved={() => {}} onBack={() => {}} onExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease tv" }));
    expect(screen.getByRole("button", { name: /^tv, 1\./ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove tv" }));
    expect(screen.getByRole("button", { name: /^tv\. Tap to add/ })).toBeTruthy();
  });

  it("adjusts an appliance count with the docked − and + buttons", () => {
    render(<SetupAppliances token="t" sin="1234567890" status={status({ grid: { electric_fan: 3 } })} onSaved={() => {}} onBack={() => {}} onExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Electric fan" }));
    expect(screen.getByRole("button", { name: /^Electric fan, 2\./ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Increase Electric fan" }));
    expect(screen.getByRole("button", { name: /^Electric fan, 3\./ })).toBeTruthy();
  });

  const snap = () => fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [new File(["x"], "photo.jpg", { type: "image/jpeg" })] },
  });

  it("'Snap an appliance' recognises an aircon, adds it and tags its tile 'Estimated from photo'", async () => {
    render(<SetupAppliances token="t" sin="1234567890" status={status()} onSaved={() => {}} onBack={() => {}} onExpired={() => {}} />);
    expect(screen.getByRole("button", { name: /snap an appliance/i })).toBeTruthy();
    snap();
    expect(await screen.findByText("Aircon: about 1.12 kWh per hour · Estimated from photo")).toBeTruthy();
    expect(screen.getByText("Estimated from photo")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Aircon, 1\./ })).toBeTruthy();
  });

  it("works for any appliance: a photo of a TV adds the TV with its estimate", async () => {
    photoReply = { type: "tv", label: "TV", answers: { size: "large" }, kwh: 0.12, unit: "kWh per hour", tag: "Estimated from photo" };
    render(<SetupAppliances token="t" sin="1234567890" status={status({ grid: { tv: 2 } })} onSaved={() => {}} onBack={() => {}} onExpired={() => {}} />);
    snap();
    expect(await screen.findByText("TV: about 0.12 kWh per hour · Estimated from photo")).toBeTruthy();
    // An appliance already counted keeps its count; the tile shows the estimate.
    const tv = screen.getByRole("button", { name: /^tv, 2\./ });
    expect(tv.textContent).toContain("0.12");
    expect(tv.textContent).toContain("Estimated from photo");
    expect(screen.queryByRole("button", { name: /^Aircon, 1\./ })).toBeNull();
  });

  it("a recognised appliance without size clues is added with the typical value", async () => {
    photoReply = { type: "rice_cooker", label: "Rice cooker", answers: {}, kwh: 0.35, unit: "kWh per use", tag: "Typical value" };
    render(<SetupAppliances token="t" sin="1234567890" status={status()} onSaved={() => {}} onBack={() => {}} onExpired={() => {}} />);
    snap();
    expect(await screen.findByText(/Rice cooker added · the photo didn't show its size/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^rice_cooker, 1\./ }).textContent).toContain("Typical value");
  });

  it("an unrecognised photo shows the server's message and adds nothing", async () => {
    fetchMock.mockImplementationOnce(async () => response({ error: "We couldn't recognise an appliance in the photo. Retake it or tap the appliance instead." }, 422));
    render(<SetupAppliances token="t" sin="1234567890" status={status()} onSaved={() => {}} onBack={() => {}} onExpired={() => {}} />);
    snap();
    expect(await screen.findByText(/couldn't recognise an appliance/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue · 0 appliances/ })).toBeTruthy();
  });
});

describe("Setup routine", () => {
  it("hides the aircon question without an aircon", () => {
    render(<SetupRoutine token="t" sin="s" status={status()} onSaved={() => {}} onBack={() => {}} onExpired={() => {}} />);
    expect(screen.getByText("When is someone usually home?")).toBeTruthy();
    expect(screen.queryByText("When is the aircon usually on?")).toBeNull();
    fireEvent.click(screen.getByLabelText(/Evenings and weekends/));
    expect((screen.getByRole("button", { name: "Finish setup · get 100 pts" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("asks when the aircon is on and shows the agreement line", async () => {
    const { AirconAgreement } = await import("../src/components/AirconAgreement");
    render(<SetupRoutine token="t" sin="s" status={status({ hasAircon: true })} onSaved={() => {}} onBack={() => {}} onExpired={() => {}}
      agreement={(aircon) => <AirconAgreement token="t" sin="s" aircon={aircon} />} />);
    fireEvent.click(screen.getByLabelText(/Almost all day/));
    expect((screen.getByRole("button", { name: "Finish setup · get 100 pts" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Sleeping only"));
    expect(await screen.findByText("✓ Your 12 bills agree: about 8 hours a day.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup · get 100 pts" }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u.endsWith("/setup/routine"))).toBe(true));
    const put = fetchMock.mock.calls.find(([u]) => u.endsWith("/setup/routine"))!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ home: "allDay", aircon: "sleeping" });
  });
});
