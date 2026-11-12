import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Appliances } from "../src/components/Appliances";
import type { AirconPatternResult, ApplianceInput, Household } from "../src/api/client";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const household: Household = { sin: "9876543210", masked_address: "••• Manila", meter_type: "smart" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const proposal = (start = "21:00", end = "05:00"): Extract<AirconPatternResult, { status: "proposal" }> => ({
  status: "proposal", canPropose: true, routine: { start, end, days: "everyday" }, hours: 8, stepKw: 1,
  prompt: `May malaking gamit mula ${start} hanggang ${end}. Aircon ba ito?`,
  timeZone: "Asia/Manila", range: null, expectedKw: 1, ratingSource: "default",
  coverage: { completeNights: 14, matchingNights: 14, heatMatchedNights: 14 },
  provenance: { readings: { kind: "synthetic", note: "Synthetic readings" }, weather: { kind: "synthetic", note: "Synthetic weather" } },
  heat: { temperatureSpanC: 2, kwPerDegreeC: 0.06, correlation: 0.9 },
});
const fallback = { ...proposal(), status: "fallback", canPropose: false, fallback: "routine", reason: "insufficient-weather" };
const catalog = { appliances: [
  { type: "wifi", label: "Wi-Fi", routine: "alwaysOn", questions: [] },
  { type: "aircon", label: "Aircon", routine: "timeRanges", questions: [
    { key: "room", label: "Gaano kalaki ang kwarto?", options: [
      { value: "unknown", label: "Hindi ko alam" }, { value: "medium", label: "Katamtaman" },
    ] },
  ] },
] };
const saveButton = () => screen.getByRole("button", { name: "I-save at tingnan kung saan napupunta" }) as HTMLButtonElement;
const inputValue = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function surveyHttp(initial: ApplianceInput[] | null = null) {
  let saved = initial;
  let pattern: (init: RequestInit) => Promise<Response> = async () => response(proposal());
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/appliances/catalog") return response(catalog);
    if (url.endsWith("/aircon-pattern-proposal")) return pattern(init!);
    if (url.includes("/aircon-proposal")) return response({ canPropose: true, hours: 8 });
    if (url.endsWith("/scan-label")) return response({
      status: "read", type: "aircon", needsConfirmation: true, missing: [], assumptions: [], kwhPerHour: 2,
      label: { consumptionKwh: 540, period: "monthly", referenceDays: 30, referenceHoursPerDay: 9 },
    });
    if (init?.method === "PUT") {
      saved = JSON.parse(String(init.body)).appliances;
      return response({ saved: true, appliances: saved });
    }
    if (url.endsWith("/breakdown")) return response({
      bill: { period: "2026-10", kwh: 240, billingDays: 30 },
      rows: (saved ?? []).map((a, index) => ({ index, type: a.type, label: a.type === "aircon" ? "Aircon" : "Wi-Fi",
        quantity: a.quantity ?? 1, source: "default", sourceLabel: "Hula (default)", kwh: 120, pesos: 132000, share: 0.5 })),
      totals: { kwh: 240, perKwhCharges: 264000, fixedCharges: 5000 },
    });
    return response({ saved: saved !== null, updatedAt: null, appliances: saved ?? [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock, setPattern: (fn: typeof pattern) => { pattern = fn; },
    requests: () => fetchMock.mock.calls.filter(([url]) => url.endsWith("/aircon-pattern-proposal")),
    saves: () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init!.body))),
  };
}
async function start() {
  const onExpired = vi.fn();
  const view = render(<Appliances token="session-a" household={household} onExpired={onExpired} />);
  await screen.findByRole("heading", { name: "Mga appliance sa bahay" });
  return { ...view, onExpired };
}
function addAircon() {
  fireEvent.change(screen.getByLabelText("Magdagdag ng appliance"), { target: { value: "aircon" } });
  fireEvent.click(screen.getByRole("button", { name: "Idagdag" }));
}
function enterRoutine(startTime = "19:00", endTime = "23:00") {
  fireEvent.click(screen.getByRole("button", { name: "Ilagay ang oras" }));
  fireEvent.change(screen.getByLabelText("Simula"), { target: { value: startTime } });
  fireEvent.change(screen.getByLabelText("Tapos"), { target: { value: endTime } });
}

it("confirms the returned window, saves explicitly, and preserves it when reopened", async () => {
  const http = surveyHttp();
  await start(); addAircon();
  await screen.findByText(proposal().prompt);
  expect(screen.getByText(/Simulated na readings/)).toBeTruthy();
  expect(saveButton().disabled).toBe(true);
  expect(http.saves()).toHaveLength(0);
  const [, init] = http.requests()[0]!;
  expect(init!.method).toBe("POST");
  expect(new Headers(init!.headers).get("Authorization")).toBe("Bearer session-a");
  expect(JSON.parse(String(init!.body))).toEqual({ quantity: 1, answers: { room: "unknown" } });
  fireEvent.click(screen.getByRole("button", { name: "Oo" }));
  expect(inputValue("Simula")).toBe("21:00");
  expect(inputValue("Tapos")).toBe("05:00");
  expect(http.saves()).toHaveLength(0);
  fireEvent.click(saveButton());
  await screen.findByRole("button", { name: "Baguhin ang mga appliance" });
  expect(http.saves()[0].appliances.find((a: ApplianceInput) => a.type === "aircon").timeRanges)
    .toEqual([{ start: "21:00", end: "05:00", days: "everyday" }]);
  fireEvent.click(screen.getByRole("button", { name: "Baguhin ang mga appliance" }));
  expect(inputValue("Simula")).toBe("21:00");
  expect(inputValue("Tapos")).toBe("05:00");
  expect(http.requests()).toHaveLength(1);
});

it("Hindi opens routine questions and saves the user's answer without adopting the pattern", async () => {
  const http = surveyHttp();
  await start(); addAircon();
  fireEvent.click(await screen.findByRole("button", { name: "Hindi" }));
  expect(screen.getByText("Kailan bukas?")).toBeTruthy();
  expect(screen.queryByLabelText("Simula")).toBeNull();
  expect(saveButton().disabled).toBe(true);
  enterRoutine();
  fireEvent.click(saveButton());
  await screen.findByRole("button", { name: "Baguhin ang mga appliance" });
  expect(http.saves()[0].appliances.find((a: ApplianceInput) => a.type === "aircon").timeRanges)
    .toEqual([{ start: "19:00", end: "23:00", days: "everyday" }]);
});

it.each(["fallback", "failure"])("keeps manual routines usable on %s", async (kind) => {
  const http = surveyHttp();
  http.setPattern(async () => kind === "fallback" ? response(fallback) : response({ error: "Hindi makuha" }, 502));
  await start(); addAircon();
  await screen.findByText("Kailan bukas?");
  expect(screen.queryByRole("button", { name: "Oo" })).toBeNull();
  enterRoutine();
  fireEvent.click(saveButton());
  await waitFor(() => expect(http.saves()).toHaveLength(1));
});

it("sends only confirmed label inputs and refreshes the pattern when the label changes", async () => {
  const http = surveyHttp();
  await start(); addAircon();
  await screen.findByText(proposal().prompt);
  fireEvent.change(screen.getByLabelText("Litrato ng energy label para sa Aircon"), {
    target: { files: [new File(["photo"], "label.jpg", { type: "image/jpeg" })] },
  });
  await screen.findByText("Tama ba ang energy label?");
  expect(http.requests()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Tama, gamitin ang energy label" }));
  await waitFor(() => expect(http.requests()).toHaveLength(2));
  expect(JSON.parse(String(http.requests()[1]![1]!.body)).energyLabel).toEqual({
    consumptionKwh: 540, period: "monthly", referenceDays: 30, referenceHoursPerDay: 9, confirmed: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "Alisin ang energy label" }));
  await waitFor(() => expect(http.requests()).toHaveLength(3));
  expect(JSON.parse(String(http.requests()[2]![1]!.body))).not.toHaveProperty("energyLabel");
  expect(http.saves()).toHaveLength(0);
});

it("reevaluates a fallback when the draft rating changes", async () => {
  const http = surveyHttp();
  http.setPattern(async () => response(fallback));
  await start(); addAircon();
  await screen.findByText("Kailan bukas?");
  http.setPattern(async () => response(proposal()));
  fireEvent.change(screen.getByLabelText("Gaano kalaki ang kwarto?"), { target: { value: "medium" } });
  await screen.findByText(proposal().prompt);
  expect(http.requests()).toHaveLength(2);
});

it("retries a no-match response without requiring a draft edit", async () => {
  const http = surveyHttp();
  http.setPattern(async () => response(fallback));
  await start(); addAircon();
  await screen.findByText("Kailan bukas?");
  http.setPattern(async () => response(proposal()));
  fireEvent.click(screen.getByRole("button", { name: "Tingnan ang pattern sa smart meter" }));
  await screen.findByText(proposal().prompt);
  expect(http.requests()).toHaveLength(2);
});

it.each(["answers", "quantity"])("aborts and ignores a delayed proposal after changing %s", async (field) => {
  const http = surveyHttp();
  const pending = deferred<Response>();
  http.setPattern(() => pending.promise);
  await start(); addAircon();
  await waitFor(() => expect(http.requests()).toHaveLength(1));
  const signal = http.requests()[0]![1]!.signal;
  http.setPattern(async () => response(proposal("23:00", "03:00")));
  fireEvent.change((field === "answers" ? screen.getByLabelText("Gaano kalaki ang kwarto?") : screen.getAllByLabelText("Ilan")[1]!), {
    target: { value: field === "answers" ? "medium" : "2" },
  });
  await screen.findByText(proposal("23:00", "03:00").prompt);
  expect(signal!.aborted).toBe(true);
  await act(async () => { pending.resolve(response(proposal())); });
  expect(screen.queryByText(proposal().prompt)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Oo" }));
  expect(inputValue("Simula")).toBe("23:00");
});

it("keeps manual answers when a cancelled request later succeeds", async () => {
  const http = surveyHttp();
  const pending = deferred<Response>();
  http.setPattern(() => pending.promise);
  await start(); addAircon();
  await waitFor(() => expect(http.requests()).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Manu-manong ilagay ang routine" }));
  enterRoutine("20:00", "02:00");
  expect(http.requests()[0]![1]!.signal!.aborted).toBe(true);
  await act(async () => { pending.resolve(response(proposal())); });
  expect(inputValue("Simula")).toBe("20:00");
  expect(inputValue("Tapos")).toBe("02:00");
  expect(screen.queryByText(proposal().prompt)).toBeNull();
});

it("ignores delayed card results after removal and a newly added aircon", async () => {
  const http = surveyHttp();
  const pending = deferred<Response>();
  http.setPattern(() => pending.promise);
  const view = await start(); addAircon();
  await waitFor(() => expect(http.requests()).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Alisin ang Aircon" }));
  expect(http.requests()[0]![1]!.signal!.aborted).toBe(true);
  http.setPattern(async () => response(proposal("23:00", "03:00")));
  addAircon();
  await screen.findByText(proposal("23:00", "03:00").prompt);
  await act(async () => { pending.resolve(response({ error: "Expired" }, 401)); });
  expect(view.onExpired).not.toHaveBeenCalled();
  expect(screen.getByText(proposal("23:00", "03:00").prompt)).toBeTruthy();
});

it.each(["household", "session", "logout"])("isolates pending proposals on %s change", async (change) => {
  const http = surveyHttp();
  const pending = deferred<Response>();
  http.setPattern(() => pending.promise);
  const view = await start(); addAircon();
  await waitFor(() => expect(http.requests()).toHaveLength(1));
  if (change === "logout") view.unmount();
  else view.rerender(<Appliances token={change === "session" ? "session-b" : "session-a"}
    household={change === "household" ? { ...household, sin: "1111111111" } : household} onExpired={view.onExpired} />);
  expect(http.requests()[0]![1]!.signal!.aborted).toBe(true);
  await act(async () => { pending.resolve(response({ error: "Expired" }, 401)); });
  expect(view.onExpired).not.toHaveBeenCalled();
  expect(screen.queryByText(proposal().prompt)).toBeNull();
});

it("routes an active 401 to session expiry", async () => {
  const http = surveyHttp();
  http.setPattern(async () => response({ error: "Expired" }, 401));
  const view = await start(); addAircon();
  await waitFor(() => expect(view.onExpired).toHaveBeenCalledTimes(1));
});

it("preserves existing routines until the user explicitly confirms a different one", async () => {
  const http = surveyHttp([{ type: "aircon", timeRanges: [{ start: "19:00", end: "23:00", days: "weekdays" }] }]);
  render(<Appliances token="session-a" household={household} onExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Baguhin ang mga appliance" }));
  expect(inputValue("Simula")).toBe("19:00");
  expect(http.requests()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Tingnan ang pattern sa smart meter" }));
  await screen.findByText(proposal().prompt);
  fireEvent.click(screen.getByRole("button", { name: "Hindi" }));
  expect(inputValue("Simula")).toBe("19:00");
  expect(inputValue("Mga araw")).toBe("weekdays");
  fireEvent.click(saveButton());
  await waitFor(() => expect(http.saves()).toHaveLength(1));
  expect(http.saves()[0].appliances[0].timeRanges).toEqual([{ start: "19:00", end: "23:00", days: "weekdays" }]);
});

it("falls back to individual routines when multiple aircon cards make attribution ambiguous", async () => {
  const http = surveyHttp();
  const pending = deferred<Response>();
  http.setPattern(() => pending.promise);
  await start(); addAircon();
  await waitFor(() => expect(http.requests()).toHaveLength(1));
  addAircon();
  expect(screen.getAllByText(/May higit sa isang aircon/)).toHaveLength(2);
  expect(http.requests()[0]![1]!.signal!.aborted).toBe(true);
  await act(async () => { pending.resolve(response(proposal())); });
  expect(screen.queryByRole("button", { name: "Oo" })).toBeNull();
});
