import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { App } from "../src/App";

const households = [
  { sin: "1234567890", masked_address: "••• Caloocan City", meter_type: "traditional" },
  { sin: "9876543210", masked_address: "••• Quezon City", meter_type: "smart" },
];
const history = (kwh: number) => [{ period: "2026-10", kwh, billingDays: 30, chargeLines: [{ label: "Sample", amount: kwh * 10 }], provenance: { kind: "sample", note: "Synthetic" } }];
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const verdictResponse = (total = 50000) => ({
  before: { period: "2026-09", kwh: 150, billingDays: 30, rebuiltTotal: 150000, printedTotal: null, estimated: false, extras: [], extrasTotal: 0 },
  now: { period: "2026-10", kwh: 200, billingDays: 31, rebuiltTotal: 200000, printedTotal: null, estimated: false, extras: [], extrasTotal: 0 },
  effects: [], lines: [], habitMeasurable: true, total, printedChange: null, extrasChange: 0, unexplained: null,
});
const expired = () => response({ error: "Mag-sign in muna." }, 401);
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
let historyRequest: (sin: string) => Promise<Response>;
let loginHouseholds = households;
let linkage: { status: string; householdSin?: string };
let loginFails = false;
let failHistory = false;
let readingsRequest: (sin: string) => Promise<Response>;
const usage = (sin: string) => ({
  sin, interval: "day", timeZone: "Asia/Manila",
  range: { from: "2026-11-01T16:00:00Z", to: "2026-11-02T16:00:00Z" }, available: null,
  provenance: { kind: "synthetic", note: "Test readings." },
  readings: [{ from: "2026-11-01T16:00:00Z", to: "2026-11-02T16:00:00Z", kwh: 12.345, partial: false }],
});

beforeEach(() => {
  historyRequest = async (sin) => response(history(sin === households[0]!.sin ? 230 : 370));
  readingsRequest = async (sin) => response(usage(sin));
  loginHouseholds = households;
  linkage = { status: "unlinked" };
  loginFails = false; failHistory = false;
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/rate-schedules") return response({ periods: ["2026-09", "2026-10", "2026-11"] });
    if (input === "/api/auth/email/start") return response({ sent: true, expiresInSeconds: 600 }, 202);
    if (input === "/api/auth/email/verify") return loginFails ? response({ error: "Mali o expired na ang code. Humingi ng bagong code." }, 401) : response({ token: "test-session" });
    if (input === "/api/households") return response(loginHouseholds);
    if (input === "/api/auth/logout") return new Response(null, { status: 204 });
    const match = /^\/api\/households\/([^/]+)\/bills$/.exec(input);
    if (match) return failHistory ? response({ error: "Hindi makuha ang Bill History. Subukan ulit." }, 502) : historyRequest(match[1]!);
    const readingsMatch = /^\/api\/households\/([^/]+)\/readings\?interval=(hour|day|week)$/.exec(input);
    if (readingsMatch) return readingsRequest(readingsMatch[1]!);
    if (input === "/api/appliances/catalog") return response({ appliances: [] });
    if (/^\/api\/households\/[^/]+\/appliances$/.test(input)) return response({ saved: false, updatedAt: null, appliances: [] });
    if (/^\/api\/households\/[^/]+\/home$/.test(input)) return response({
      meterType: input.includes(households[0]!.sin) ? "traditional" : "smart",
      bill: { period: "2026-10", amountDue: 10000, dueDate: null, billDate: null },
      badge: { status: "green", label: "Tugma ang bill" }, bakitGanito: null, bakitGanitoUnavailable: "Kailangan ng dalawang Bill para maikumpara.",
      tamaBa: { status: "green", label: "Tugma ang bill", failedChecks: 0, summary: "OK", screen: "tama-ba" },
      action: { kind: "missions", label: "Tingnan ang Missions", screen: "missions" }, smartMeter: null,
    });
    if (/^\/api\/households\/[^/]+\/target$/.test(input)) return response({
      period: "2026-11", billingDays: 30, rateSchedulePeriod: "2026-11",
      baseline: { kwh: 230, kwhPerDay: 230 / 30, pesos: 230000, weatherAdjusted: false, weatherKwhPerDay: 0, heatSensitivity: { value: 1, source: "cooling_appliance_estimate", label: "Estimate" } },
      options: [{ cut: 10, kwh: 207, pesos: 207000, savings: 23000 }],
    });
    if (/^\/api\/households\/[^/]+\/usage-plan$/.test(input)) return response({ active: false, plan: null });
    if (/^\/api\/households\/[^/]+\/missions$/.test(input)) return response({ error: "Ilista muna ang mga appliance." }, 409);
    if (input === "/api/bills/scan") return response({ status: "read", now: { period: "2026-10", kwh: 200, billingDays: 31 }, before: { period: "2026-09", kwh: 150, billingDays: 30 }, missing: [], estimated: [], serviceIdMasked: "••••••7890", scanToken: "a".repeat(43) });
    if (input === "/api/bills/scan-linkage") return response(linkage);
    if (input === "/api/bakit-ganito") return response(verdictResponse());
    if (input === "/api/bills/check") {
      return response({
        overall: "green",
        checks: [
          { key: "lineSum", title: "Lines sum", status: "pass", message: "OK" },
          { key: "readingContinuity", title: "Readings", status: "pass", message: "OK" },
          { key: "rateSchedule", title: "Rates", status: "pass", message: "OK" },
          { key: "paymentReflection", title: "Payments", status: "pass", message: "OK" },
        ],
        failedChecks: [],
        summary: "Lahat ng nasuring Meralco figures ay nagtutugma.",
      });
    }
    if (/^\/api\/households\/[^/]+\/check$/.test(input)) {
      return response({
        overall: "green",
        checks: [
          { key: "lineSum", title: "Lines sum", status: "pass", message: "OK" },
          { key: "readingContinuity", title: "Readings", status: "pass", message: "OK" },
          { key: "rateSchedule", title: "Rates", status: "pass", message: "OK" },
          { key: "paymentReflection", title: "Payments", status: "pass", message: "OK" },
        ],
        failedChecks: [],
        summary: "Lahat ng nasuring Meralco figures ay nagtutugma.",
      });
    }
    throw new Error(`Unexpected request: ${input} ${init?.method ?? "GET"}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function enterCode(code = "123456") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByRole("heading", { name: "Check your email" });
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
}
async function login() {
  await enterCode();
  await screen.findByRole("heading", { name: "Mga Household mo" });
}
function select(sin: string) { fireEvent.change(screen.getByLabelText("Piliin ang Household"), { target: { value: sin } }); }
async function scanAndConfirm() {
  const photo = new File(["fake-jpeg"], "bill.jpg", { type: "image/jpeg" });
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [photo] } });
  const confirm = await screen.findByRole("button", { name: "Oo, tama" });
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(confirm);
}

describe("My Meralco PWA", () => {
  it("resets to daily and isolates readings when changing between smart Households", async () => {
    const secondSmart = { sin: "1111111111", masked_address: "••• Manila", meter_type: "smart" };
    loginHouseholds = [...households, secondSmart];
    render(<App />); await login(); select(households[1]!.sin);
    await screen.findByText("12.345 kWh");
    let resolve!: (r: Response) => void;
    readingsRequest = (sin) => sin === households[1]!.sin ? new Promise((r) => { resolve = r; })
      : Promise.resolve(response({ ...usage(sin), readings: [{ ...usage(sin).readings[0]!, kwh: 2.345 }] }));
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    select(secondSmart.sin);
    expect(screen.queryByText("12.345 kWh")).toBeNull();
    expect(screen.getByRole("button", { name: "Day" }).getAttribute("aria-pressed")).toBe("true");
    await screen.findByText("2.345 kWh");
    await act(async () => resolve(response(usage(households[1]!.sin))));
    expect(screen.queryByText("12.345 kWh")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/households/${secondSmart.sin}/readings?interval=day`)).toBe(true);
  });

  it("loads smart readings and Bills without uploading and clears usage on traditional selection", async () => {
    render(<App />); await login(); select(households[1]!.sin);
    await screen.findByText("12.345 kWh");
    expect(screen.getByRole("cell", { name: "370" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Mga appliance sa bahay" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ano ang gagawin ko/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Target at Missions" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/bills/scan")).toBe(false);
    select(households[0]!.sin);
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    await screen.findByRole("cell", { name: "230" });
    expect(screen.getByRole("heading", { name: "Target at Missions" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/readings"))).toHaveLength(1);
  });

  it("keeps Bills usable if readings fail and expires the session if readings return 401", async () => {
    readingsRequest = async () => response({ error: "Readings unavailable" }, 502);
    render(<App />); await login(); select(households[1]!.sin);
    await screen.findByText("Readings unavailable");
    expect(screen.getByRole("cell", { name: "370" })).toBeTruthy();
    readingsRequest = async () => expired();
    fireEvent.click(screen.getByRole("button", { name: "Subukan ulit ang readings" }));
    await screen.findByText(/Nag-expire ang session/);
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it.each(["traditional", "logout", "clear"])('ignores late readings after %s', async (action) => {
    let resolve!: (r: Response) => void;
    readingsRequest = () => new Promise((r) => { resolve = r; });
    render(<App />); await login(); select(households[1]!.sin);
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    const signal = fetchMock.mock.calls.find(([url]) => url.includes("/readings"))![1]!.signal!;
    if (action === "logout") fireEvent.click(screen.getByRole("button", { name: "Mag-logout" }));
    else select(action === "clear" ? "" : households[0]!.sin);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    await act(async () => resolve(response(usage(households[1]!.sin))));
    expect(screen.queryByText("12.345 kWh")).toBeNull();
  });

  it("logs in, masks Household details, and shows the chosen history without an upload", async () => {
    render(<App />); await login();
    expect(screen.getByRole("option", { name: /Caloocan.*Traditional meter/ }).textContent).toContain("••••••7890");
    expect(document.body.textContent).not.toContain("1234567890");
    select(households[0]!.sin);
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("cell", { name: "230" })).toBeTruthy();
    expect(screen.getByText(/Hindi ito totoong Bill History/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/readings"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url, init]) => url.includes("/households/") && new Headers(init?.headers).get("authorization") === "Bearer test-session")).toBe(true);
  });

  it("ignores a delayed response after switching Households and immediately hides the old history", async () => {
    let resolveFirst!: (r: Response) => void;
    historyRequest = (sin) => sin === households[0]!.sin ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve(response(history(370)));
    render(<App />); await login(); select(households[0]!.sin);
    await waitFor(() => expect(resolveFirst).toBeTypeOf("function"));
    select(households[1]!.sin);
    await screen.findByRole("cell", { name: "370" });
    await act(async () => resolveFirst(response(history(230))));
    expect(screen.queryByRole("cell", { name: "230" })).toBeNull();
    expect(screen.getByRole("heading", { name: /Bill History/ }).textContent).toContain("••••••3210");
    select("");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("clears protected data on logout and ignores a history response arriving afterward", async () => {
    let resolveHistory!: (r: Response) => void;
    historyRequest = () => new Promise((resolve) => { resolveHistory = resolve; });
    render(<App />); await login(); select(households[0]!.sin);
    await waitFor(() => expect(resolveHistory).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "Mag-logout" }));
    await act(async () => resolveHistory(response(history(230))));
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryByRole("table")).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/auth/logout")).toBe(true));
  });

  it("ignores a delayed Bill explanation after changing Household", async () => {
    let resolveExplanation!: (r: Response) => void;
    historyRequest = async (sin) => response(sin === households[0]!.sin
      ? [{ ...history(200)[0], period: "2026-09" }, ...history(230)] : history(370));
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input: string, init?: RequestInit) => input.endsWith("/bakit-ganito") && input.includes("/households/")
      ? new Promise<Response>((resolve) => { resolveExplanation = resolve; }) : originalFetch(input, init));
    render(<App />); await login(); select(households[0]!.sin);
    await waitFor(() => expect(resolveExplanation).toBeTypeOf("function"));
    select(households[1]!.sin);
    await screen.findByRole("cell", { name: "370" });
    await act(async () => resolveExplanation(response(verdictResponse(11111))));
    expect(screen.queryByText("₱111.11")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Bakit ganito?" })).toBeNull();
  });

  it("clears the session when a protected request returns 401", async () => {
    historyRequest = async () => expired();
    render(<App />); await login(); select(households[0]!.sin);
    await screen.findByText(/Nag-expire ang session/);
    expect(screen.queryByRole("heading", { name: "Mga Household mo" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("handles an empty Household list", async () => {
    loginHouseholds = [];
    render(<App />); await login();
    expect(screen.getByText(/Wala pang naka-link na Household/)).toBeTruthy();
    expect(screen.queryByLabelText("Piliin ang Household")).toBeNull();
  });

  it("signs in with an emailed code and shows a wrong-code error", async () => {
    loginFails = true;
    render(<App />);
    await enterCode("000000");
    await screen.findByText("Mali o expired na ang code. Humingi ng bagong code.");
    expect(fetchMock.mock.calls.find(([url]) => url === "/api/auth/email/start")![1]!.body).toBe(JSON.stringify({ email: "demo@example.com" }));
    expect(screen.getByText(/resend code in 0:30/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("supports retry after a history error without keeping stale data", async () => {
    failHistory = true;
    render(<App />); await login(); select(households[0]!.sin);
    await screen.findByText("Hindi makuha ang Bill History. Subukan ulit.");
    expect(screen.queryByRole("table")).toBeNull();
    failHistory = false;
    fireEvent.click(screen.getByRole("button", { name: "Subukan ulit" }));
    await screen.findByRole("cell", { name: "230" });
  });

  it("keeps an unlinked scan on the quick-verdict path after confirmation and login", async () => {
    render(<App />);
    await scanAndConfirm();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/bills/scan-linkage")).toBe(false);
    await login();
    await screen.findByText(/Hindi naka-link ang account na ito sa My Meralco mo/);
    expect(screen.queryByRole("table")).toBeNull();
    const verdict = screen.getByRole("button", { name: "Bakit ganito?" }) as HTMLButtonElement;
    expect(verdict.disabled).toBe(false);
    fireEvent.click(verdict);
    await screen.findByRole("heading", { name: "Bakit ganito?" });
  });

  it("offers the matching Household explicitly and clears linkage state on logout", async () => {
    linkage = { status: "linked", householdSin: households[0]!.sin };
    render(<App />); await login(); await scanAndConfirm();
    const button = await screen.findByRole("button", { name: "Tingnan ang Bill History ng Household na ito" });
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(button);
    await screen.findByRole("cell", { name: "230" });
    fireEvent.click(screen.getByRole("button", { name: "Mag-logout" }));
    expect(screen.queryByText(/Naka-link sa Household/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});


describe("merged bill breakdown and scan linkage", () => {
  function scannedBillsWithLines() {
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (input === "/api/bills/scan") {
        const result = await originalFetch(input, init);
        const body = await result.json();
        return response({ ...body, now: { ...body.now, chargeLines: [{ label: "Generation Charge", amount: 123 }] } });
      }
      if (input === "/api/bills/laman") return response({ groups: [], total: 12300, split: { passThrough: 12300, meralco: 0 } });
      return originalFetch(input, init);
    });
  }

  it("shows the printed-charge breakdown alongside an unlinked scan's quick verdict", async () => {
    scannedBillsWithLines();
    render(<App />); await login(); await scanAndConfirm();
    await screen.findByText(/Hindi naka-link ang account na ito sa My Meralco mo\./);
    fireEvent.click(screen.getByRole("button", { name: "Bakit ganito?" }));
    await screen.findByRole("heading", { name: "Bakit ganito?" });
    expect(screen.getByRole("heading", { name: "Ano'ng laman ng bill ko?" })).toBeTruthy();
    expect(screen.getByText("Kabuuan ng mga linya").parentElement?.textContent).toContain("₱123.00");
    const breakdownCall = fetchMock.mock.calls.find(([url]) => url === "/api/bills/laman")!;
    expect(JSON.parse(String(breakdownCall[1]?.body)).now.chargeLines).toEqual([{ label: "Generation Charge", amount: 123 }]);
  });

  it("discards a delayed verdict and breakdown when a Bill is edited", async () => {
    scannedBillsWithLines();
    const originalFetch = fetchMock.getMockImplementation()!;
    let resolveBreakdown!: (r: Response) => void;
    fetchMock.mockImplementation((input, init) => input === "/api/bills/laman"
      ? new Promise<Response>((resolve) => { resolveBreakdown = resolve; }) : originalFetch(input, init));
    render(<App />); await scanAndConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Bakit ganito?" }));
    await waitFor(() => expect(resolveBreakdown).toBeTypeOf("function"));
    fireEvent.change(screen.getAllByLabelText("kWh na nagamit")[1]!, { target: { value: "201" } });
    await act(async () => resolveBreakdown(response({ groups: [], total: 12300, split: { passThrough: 12300, meralco: 0 } })));
    expect(screen.queryByRole("heading", { name: "Bakit ganito?" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Ano'ng laman ng bill ko?" })).toBeNull();
  });

  it("taps Weather Effect in 'Bakit ganito?' to reveal bawat mas mainit na araw", async () => {
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (input === "/api/bakit-ganito") {
        return response({
          ...verdictResponse(),
          effects: [
            { key: "rate", label: "Rate Effect", amount: 10000 },
            { key: "billingDays", label: "Billing Days Effect", amount: 10000 },
            {
              key: "weather",
              label: "Weather Effect (tantya)",
              amount: 15000,
              estimate: true,
              sensitivity: 1.5,
              sensitivitySource: "history",
              hotDayKwh: 1.5,
            },
            { key: "habit", label: "Habit Effect", amount: 15000 },
          ],
        });
      }
      if (input === "/api/bills/scan") {
        return response({
          status: "read",
          now: { period: "2026-10", kwh: 200, billingDays: 31 },
          before: { period: "2026-09", kwh: 150, billingDays: 30 },
          missing: [],
          estimated: [],
          serviceIdMasked: "••••••7890",
          scanToken: "a".repeat(43),
        });
      }
      if (input === "/api/rate-schedules") return response({ periods: ["2026-09", "2026-10"] });
      return originalFetch(input, init);
    });

    render(<App />);
    await scanAndConfirm();
    const decodeBtn = await screen.findByRole("button", { name: /Bakit ganito/ });
    fireEvent.click(decodeBtn);
    await screen.findByRole("heading", { name: "Bakit ganito?" });

    const weatherRow = screen.getByRole("button", { name: /Weather Effect/ });
    expect(weatherRow.textContent).toContain("Weather Effect (tantya)");
    expect(weatherRow.textContent).toContain("Epekto ng init ng panahon (tantya)");

    // Tap to expand
    fireEvent.click(weatherRow);
    expect(weatherRow.textContent).toContain("bawat mas mainit na araw ≈ +1.5 kWh mula sa sariling mga Bill");

    // Tap to collapse
    fireEvent.click(weatherRow);
    expect(weatherRow.textContent).toContain("Epekto ng init ng panahon (tantya)");
  });
});
