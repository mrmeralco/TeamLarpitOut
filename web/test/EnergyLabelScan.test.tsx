import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Appliances } from "../src/components/Appliances";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("preserves a confirmed label when reopening and editing an appliance, without sending derived consumption", async () => {
  const energyLabel = {
    consumptionKwh: 30, period: "monthly", referenceDays: 30, confirmed: true, kwhPerHour: 1 / 24,
  };
  const response = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  }));
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/appliances/catalog") return response({ appliances: [
      { type: "refrigerator", label: "Refrigerator", routine: "alwaysOn", questions: [] },
    ] });
    if (init?.method === "PUT") return response({ saved: true });
    if (url.endsWith("/breakdown")) return response({
      bill: { period: "2026-10", kwh: 240, billingDays: 30 },
      rows: [{ index: 0, type: "refrigerator", label: "Refrigerator", quantity: 1, source: "label",
        sourceLabel: "From the energy label", kwh: 240, pesos: 264000, share: 1 }],
      totals: { kwh: 240, perKwhCharges: 264000, fixedCharges: 5000 },
    });
    return response({ saved: true, updatedAt: "2026-11-12", appliances: [
      { type: "refrigerator", quantity: 1, answers: {}, energyLabel, source: "label", sourceLabel: "From the energy label" },
    ] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Appliances token="test-token" household={{
    sin: "1234567890", masked_address: "••• Manila", meter_type: "traditional",
  }} onExpired={vi.fn()} />);
  expect(await screen.findByText("From the energy label")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Change the appliances" }));
  fireEvent.change(screen.getByLabelText("How many"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save and see where it goes" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
  const [url, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(url).toBe("/api/households/1234567890/appliances");
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
  expect(JSON.parse(String(init?.body))).toEqual({ appliances: [{
    type: "refrigerator", quantity: 2, answers: {}, energyLabel: {
      consumptionKwh: 30, period: "monthly", referenceDays: 30, confirmed: true,
    },
  }] });
  await screen.findByText("From the energy label");
});

// Exercise the real multipart client and component together; only HTTP is replaced.
const household = { sin: "1234567890", masked_address: "••• Manila", meter_type: "traditional" as const };
const catalog = [
  { type: "wifi", label: "WiFi", routine: "alwaysOn", questions: [] },
  { type: "aircon", label: "Aircon", routine: "timeRanges", questions: [] },
  { type: "refrigerator", label: "Refrigerator", routine: "alwaysOn", questions: [] },
];
const photo = () => new File(["fake-label"], "label.jpg", { type: "image/jpeg" });
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const draftFor = (type: string) => ({
  status: "read", type, needsConfirmation: true, missing: [], assumptions: [],
  label: { consumptionKwh: type === "aircon" ? 270 : 30, period: "monthly", referenceDays: 30, referenceHoursPerDay: type === "aircon" ? 9 : 24 },
  kwhPerHour: type === "aircon" ? 1 : 1 / 24,
});

function surveyHttp() {
  let saved: any[] | null = null;
  let scan: (type: string, init: RequestInit) => Promise<Response> = async (type) => jsonResponse(draftFor(type));
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/appliances/catalog") return jsonResponse({ appliances: catalog });
    if (url.includes("/aircon-proposal")) return jsonResponse({ canPropose: true, hours: 8, prompt: "Your aircon seems to run about 8 hours a day. Is that right?" });
    if (url.endsWith("/scan-label")) return scan(String((init!.body as FormData).get("type")), init!);
    if (init?.method === "PUT") {
      saved = JSON.parse(String(init.body)).appliances;
      return jsonResponse({ saved: true });
    }
    if (url.endsWith("/breakdown")) return jsonResponse({
      bill: { period: "2026-10", kwh: 240, billingDays: 30 },
      rows: (saved ?? []).map((a, index) => ({ index, type: a.type, label: catalog.find((c) => c.type === a.type)!.label,
        quantity: a.quantity ?? 1, source: a.energyLabel ? "label" : "default", sourceLabel: a.energyLabel ? "From the energy label" : "Typical value",
        kwh: 80, pesos: 88000, share: 1 / 3 })),
      totals: { kwh: 240, perKwhCharges: 264000, fixedCharges: 5000 },
    });
    return jsonResponse({ saved: saved !== null, updatedAt: saved ? "2026-11-12" : null, appliances: saved ?? [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, setScan: (fn: typeof scan) => { scan = fn; }, saves: () => fetchMock.mock.calls
    .filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init!.body)).appliances as any[]) };
}

const saveButton = () => screen.getByRole("button", { name: "Save and see where it goes" });
const confirmButton = () => screen.getByRole("button", { name: "Correct, use the energy label" });
const upload = (type: string) => fireEvent.change(screen.getByLabelText(`Energy label photo for ${type === "aircon" ? "Aircon" : "Refrigerator"}`), { target: { files: [photo()] } });
async function startSurvey() {
  const expired = vi.fn();
  const view = render(<Appliances token="test-token" household={household} onExpired={expired} />);
  await screen.findByRole("heading", { name: "Appliances at home" });
  return { ...view, expired };
}
async function addAircon() {
  fireEvent.change(screen.getByLabelText("Add an appliance"), { target: { value: "aircon" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(await screen.findByRole("button", { name: "Yes" }));
}

it.each(["aircon", "refrigerator"])("reviews, corrects, confirms, saves, reopens, and removes a %s label", async (type) => {
  const http = surveyHttp();
  await startSurvey();
  if (type === "aircon") await addAircon();
  upload(type);
  await screen.findByText("Is the energy label right?");
  expect(http.saves()).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("kWh on the label"), { target: { value: "0" } });
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("kWh on the label"), { target: { value: type === "aircon" ? "135" : "60" } });
  if (type === "aircon") {
    fireEvent.change(screen.getByLabelText("Hours per day (the label's basis)"), { target: { value: "6" } });
    expect(screen.getByText("0.75 kWh/hour while running")).toBeTruthy();
  } else expect(screen.getByText("0.0833333 kWh/hour (average)")).toBeTruthy();
  fireEvent.click(confirmButton());
  expect(http.saves()).toHaveLength(0);
  fireEvent.click(saveButton());
  await screen.findByRole("button", { name: "Change the appliances" });
  const label = http.saves()[0]!.find((a) => a.type === type).energyLabel;
  expect(label).toEqual({ consumptionKwh: type === "aircon" ? 135 : 60, period: "monthly", referenceDays: 30,
    ...(type === "aircon" ? { referenceHoursPerDay: 6 } : {}), confirmed: true });
  expect(screen.getByText("From the energy label")).toBeTruthy();
  const [, request] = http.fetchMock.mock.calls.find(([url]) => url.endsWith("/scan-label"))!;
  expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer test-token");
  expect(request?.signal).toBeInstanceOf(AbortSignal);
  expect((request?.body as FormData).get("photo")).toBeInstanceOf(File);
  fireEvent.click(screen.getByRole("button", { name: "Change the appliances" }));
  expect(screen.getByText(new RegExp(`${type === "aircon" ? 135 : 60} kWh/month`))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove the energy label" }));
  fireEvent.click(saveButton());
  await screen.findByRole("button", { name: "Change the appliances" });
  expect(http.saves()[1]!.find((a) => a.type === type)).not.toHaveProperty("energyLabel");
  expect(screen.queryByText("From the energy label")).toBeNull();
});

it("saves the fallback while a scanned label is unconfirmed", async () => {
  const http = surveyHttp();
  await startSurvey();
  upload("refrigerator");
  await screen.findByText("Is the energy label right?");
  fireEvent.click(saveButton());
  await screen.findByRole("button", { name: "Change the appliances" });
  expect(http.saves()[0]!.every((a) => !a.energyLabel)).toBe(true);
});

it("shows missing fields and assumptions and validates a changed consumption period", async () => {
  const http = surveyHttp();
  http.setScan(async () => jsonResponse({ ...draftFor("aircon"), label: {
    consumptionKwh: null, period: null, referenceDays: null, referenceHoursPerDay: 9,
  }, missing: ["consumptionKwh", "period"], assumptions: [{ field: "referenceHoursPerDay", value: 9, reason: "Palagay: 9 hours/day. Pakisuri." }] }));
  await startSurvey(); await addAircon(); upload("aircon");
  await screen.findByText("Palagay: 9 hours/day. Pakisuri.");
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("kWh on the label"), { target: { value: "9" } });
  fireEvent.change(screen.getByLabelText("Consumption period"), { target: { value: "daily" } });
  expect(screen.getByText("1 kWh/hour while running")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Consumption period"), { target: { value: "monthly" } });
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Days in a month (the label's basis)"), { target: { value: "30" } });
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(false);
});

it("keeps the previous confirmed value after a cancelled replacement or scan error", async () => {
  const http = surveyHttp();
  await startSurvey(); upload("refrigerator");
  await screen.findByText("Is the energy label right?"); fireEvent.click(confirmButton());
  upload("refrigerator"); await screen.findByText("Is the energy label right?");
  fireEvent.change(screen.getByLabelText("kWh on the label"), { target: { value: "999" } });
  fireEvent.click(screen.getByRole("button", { name: "Don't use the scan" }));
  expect(screen.queryByText("Is the energy label right?")).toBeNull();
  http.setScan(async () => jsonResponse({ error: "Blurry, use your answers for now." }, 422));
  upload("refrigerator"); await screen.findByRole("alert");
  fireEvent.click(saveButton());
  await screen.findByRole("button", { name: "Change the appliances" });
  expect(http.saves()[0]!.find((a) => a.type === "refrigerator").energyLabel.consumptionKwh).toBe(30);
});

it.each([502, 503])("keeps fallback answers usable after a %i scan error", async (status) => {
  const http = surveyHttp();
  http.setScan(async () => jsonResponse({ error: "Try again or use your answers." }, status));
  await startSurvey(); upload("refrigerator");
  await screen.findByRole("alert");
  fireEvent.click(saveButton());
  await screen.findByRole("button", { name: "Change the appliances" });
  expect(http.saves()[0]!.every((a) => !a.energyLabel)).toBe(true);
});

it("expires the session on an authenticated scan's 401", async () => {
  const http = surveyHttp();
  http.setScan(async () => jsonResponse({ error: "Login required" }, 401));
  const { expired } = await startSurvey(); upload("refrigerator");
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("ignores an older retake result and supports replacing a confirmed value", async () => {
  const http = surveyHttp();
  let resolveFirst!: (response: Response) => void;
  http.setScan(() => new Promise((resolve) => { resolveFirst = resolve; }));
  await startSurvey(); upload("refrigerator");
  await waitFor(() => expect(resolveFirst).toBeTypeOf("function"));
  const first = http.fetchMock.mock.calls.find(([url]) => url.endsWith("/scan-label"))![1]!.signal!;
  http.setScan(async () => jsonResponse({ ...draftFor("refrigerator"), label: { ...draftFor("refrigerator").label, consumptionKwh: 60 } }));
  upload("refrigerator"); await screen.findByText("Is the energy label right?");
  expect(first.aborted).toBe(true);
  await act(async () => resolveFirst(jsonResponse(draftFor("refrigerator"))));
  expect((screen.getByLabelText("kWh on the label") as HTMLInputElement).value).toBe("60");
  fireEvent.click(confirmButton());
  // Replace the just-confirmed value with a fresh scan.
  http.setScan(async () => jsonResponse(draftFor("refrigerator")));
  upload("refrigerator"); await screen.findByText("Is the energy label right?"); fireEvent.click(confirmButton());
  fireEvent.click(saveButton()); await screen.findByRole("button", { name: "Change the appliances" });
  expect(http.saves()[0]!.find((a) => a.type === "refrigerator").energyLabel.consumptionKwh).toBe(30);
});

it("keeps an in-flight scan on its card when an earlier card is removed", async () => {
  const http = surveyHttp();
  let resolve!: (response: Response) => void;
  http.setScan(() => new Promise((done) => { resolve = done; }));
  await startSurvey(); await addAircon(); upload("aircon");
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Remove Refrigerator" }));
  await act(async () => resolve(jsonResponse(draftFor("aircon"))));
  await screen.findByText("Is the energy label right?"); fireEvent.click(confirmButton());
  fireEvent.click(saveButton()); await screen.findByRole("button", { name: "Change the appliances" });
  expect(http.saves()[0]!.find((a) => a.type === "aircon").energyLabel.consumptionKwh).toBe(270);
  expect(http.saves()[0]!.filter((a) => a.type !== "aircon").every((a) => !a.energyLabel)).toBe(true);
});

it.each(["remove-card", "household", "session", "logout"])("aborts a scan and ignores its delayed result after %s", async (change) => {
  const http = surveyHttp();
  let resolve!: (response: Response) => void;
  http.setScan(() => new Promise((done) => { resolve = done; }));
  const view = await startSurvey(); upload("refrigerator");
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  const signal = http.fetchMock.mock.calls.find(([url]) => url.endsWith("/scan-label"))![1]!.signal!;
  if (change === "remove-card") {
    fireEvent.click(screen.getByRole("button", { name: "Remove Refrigerator" }));
    fireEvent.change(screen.getByLabelText("Add an appliance"), { target: { value: "refrigerator" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
  } else if (change === "logout") view.unmount();
  else {
    view.rerender(<Appliances token={change === "session" ? "new-token" : "test-token"}
      household={change === "household" ? { ...household, sin: "9876543210" } : household} onExpired={view.expired} />);
    await screen.findByRole("heading", { name: "Appliances at home" });
  }
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(jsonResponse(draftFor("refrigerator"))));
  expect(screen.queryByText("Is the energy label right?")).toBeNull();
  expect(screen.queryByText("From the energy label")).toBeNull();
  expect(http.saves()).toHaveLength(0);
});
