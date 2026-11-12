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
const expired = () => response({ error: "Please sign in first." }, 401);
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
let historyRequest: (sin: string) => Promise<Response>;
let loginHouseholds = households;
let loginFails = false;
let failHistory = false;
const setupStatus = (done: boolean[]) => ({
  steps: [
    { key: "household", label: "Household info", done: done[0] },
    { key: "appliances", label: "Appliances", done: done[1] },
    { key: "routine", label: "Typical day", done: done[2] },
  ],
  doneCount: done.filter(Boolean).length, total: 3, complete: done.every(Boolean),
  household: done[0] ? { size: 4 } : null, routine: done[2] ? { home: "eveningsWeekends", aircon: "sleeping" } : null,
  hasAircon: true, welcomePoints: { points: 100, granted: done.every(Boolean), locked: done.every(Boolean) },
});
let setup = setupStatus([true, true, true]);
let readingsRequest: (sin: string) => Promise<Response>;
const usage = (sin: string) => ({
  sin, interval: "day", timeZone: "Asia/Manila",
  range: { from: "2026-11-01T16:00:00Z", to: "2026-11-02T16:00:00Z" }, available: null,
  provenance: { kind: "synthetic", note: "Test readings." },
  readings: [{ from: "2026-11-01T16:00:00Z", to: "2026-11-02T16:00:00Z", kwh: 12.345, partial: false }],
});

beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = "";
  historyRequest = async (sin) => response(history(sin === households[0]!.sin ? 230 : 370));
  readingsRequest = async (sin) => response(usage(sin));
  loginHouseholds = households;
  loginFails = false; failHistory = false;
  setup = setupStatus([true, true, true]);
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/rate-schedules") return response({ periods: ["2026-09", "2026-10", "2026-11"] });
    if (input === "/api/auth/signin") return loginFails ? response({ error: "The email or password is incorrect." }, 401) : response({ token: "test-session" });
    if (input === "/api/households") return response(loginHouseholds);
    if (/^\/api\/households\/[^/]+\/setup$/.test(input)) return response(setup);
    if (/^\/api\/households\/[^/]+\/missions\/plan$/.test(input)) return response({
      period: "2026-11", goal: { cut: 5, kwh: 31, pesos: 34100, baselineKwh: 620, targetKwh: 589, targetPesos: 600000 }, covered: 1, coveredPercent: 5,
      source: "fallback", points: "Points are counted on your whole bill.",
      missions: [{ id: "aircon-off-1h", title: "Turn off the aircon 1 hour earlier", why: "Why.", how: ["Do it."], appliance: "aircon", kwhSaved: 18.6, pesoValue: 20800, percent: 3, share: 0.6, effort: "Easy", basis: "physics", assumptions: [] }],
    });
    if (/^\/api\/households\/[^/]+\/setup\/household$/.test(input)) {
      setup = setupStatus([true, setup.steps[1]!.done, setup.steps[2]!.done]);
      return response(setup);
    }
    if (/^\/api\/households\/[^/]+\/rewards$/.test(input)) return response({ sin: "x", balance: 0, tag: "sample rewards", disclaimer: "Sample.", catalog: [], history: [] });
    if (input === "/api/auth/logout") return new Response(null, { status: 204 });
    const match = /^\/api\/households\/([^/]+)\/bills$/.exec(input);
    if (match) return failHistory ? response({ error: "We couldn't get the Bill History. Please try again." }, 502) : historyRequest(match[1]!);
    const readingsMatch = /^\/api\/households\/([^/]+)\/readings\?interval=(hour|day|week)$/.exec(input);
    if (readingsMatch) return readingsRequest(readingsMatch[1]!);
    if (input === "/api/appliances/catalog") return response({ appliances: [] });
    if (/^\/api\/households\/[^/]+\/appliances$/.test(input)) return response({ saved: false, updatedAt: null, appliances: [] });
    if (/^\/api\/households\/[^/]+\/home$/.test(input)) return response({
      meterType: input.includes(households[0]!.sin) ? "traditional" : "smart", canMasked: "39•• ••• 482", area: "Caloocan City",
      chargeLines: { featured: [], all: [] },
      bill: { period: "2026-10", amountDue: 10000, dueDate: null, billDate: null },
      badge: { status: "green", label: "Bill verified" }, bakitGanito: null, bakitGanitoUnavailable: "Two Bills are needed to compare.",
      tamaBa: { status: "green", label: "Bill verified", failedChecks: 0, summary: "OK", screen: "tama-ba" },
      action: { kind: "missions", label: "See Missions", screen: "missions" }, smartMeter: null,
    });
    if (/^\/api\/households\/[^/]+\/target$/.test(input)) return response({
      period: "2026-11", billingDays: 30, rateSchedulePeriod: "2026-11",
      baseline: { kwh: 230, kwhPerDay: 230 / 30, pesos: 230000, weatherAdjusted: false, weatherKwhPerDay: 0, heatSensitivity: { value: 1, source: "cooling_appliance_estimate", label: "Estimate" } },
      options: [{ cut: 10, kwh: 207, pesos: 207000, savings: 23000 }],
    });
    if (/^\/api\/households\/[^/]+\/usage-plan$/.test(input)) return response({ active: false, plan: null });
    if (/^\/api\/households\/[^/]+\/missions$/.test(input)) return response({ error: "List the appliances first." }, 409);
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
        summary: "All of Meralco's figures checked match.",
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
        summary: "All of Meralco's figures checked match.",
      });
    }
    throw new Error(`Unexpected request: ${input} ${init?.method ?? "GET"}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** The Home tab asked for this Household's Bill History (it drives the explanation and checks). */
const historyFetched = (sin: string, times = 1) => waitFor(() =>
  expect(fetchMock.mock.calls.filter(([url]) => url === `/api/households/${sin}/bills`).length).toBeGreaterThanOrEqual(times));

/** Returning user: Sign up screen → "Sign in" → Gmail address + password. */
async function signIn(password = "rosa2026x") {
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Welcome back" });
  fireEvent.change(screen.getByLabelText("Gmail address"), { target: { value: "demo@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}
async function login() {
  await signIn();
  await screen.findByRole("navigation", { name: "Main" });
}
async function goTab(name: "Home" | "Missions" | "Rewards" | "Account") {
  const link = within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name });
  await act(async () => { window.location.hash = link.getAttribute("href")!.slice(1); });
  await waitFor(() => expect(link.getAttribute("aria-current")).toBe("page"));
}
/** The picker lives in Account; come back to Home after choosing. */
async function select(sin: string) {
  await goTab("Account");
  fireEvent.change(screen.getByLabelText("Choose a Household"), { target: { value: sin } });
  await goTab("Home");
}

describe("My Meralco PWA", () => {
  it("resets to daily and isolates readings when changing between smart Households", async () => {
    const secondSmart = { sin: "1111111111", masked_address: "••• Manila", meter_type: "smart" };
    loginHouseholds = [...households, secondSmart];
    render(<App />); await login(); await select(households[1]!.sin);
    await screen.findByText("12.345 kWh");
    let resolve!: (r: Response) => void;
    readingsRequest = (sin) => sin === households[1]!.sin ? new Promise((r) => { resolve = r; })
      : Promise.resolve(response({ ...usage(sin), readings: [{ ...usage(sin).readings[0]!, kwh: 2.345 }] }));
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    await select(secondSmart.sin);
    expect(screen.queryByText("12.345 kWh")).toBeNull();
    expect(screen.getByRole("button", { name: "Day" }).getAttribute("aria-pressed")).toBe("true");
    await screen.findByText("2.345 kWh");
    await act(async () => resolve(response(usage(households[1]!.sin))));
    expect(screen.queryByText("12.345 kWh")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/households/${secondSmart.sin}/readings?interval=day`)).toBe(true);
  });

  it("loads smart readings and Bills without uploading and clears usage on traditional selection", async () => {
    render(<App />); await login(); await select(households[1]!.sin);
    await screen.findByText("12.345 kWh");
    await historyFetched(households[1]!.sin);
    expect(await screen.findByRole("button", { name: /Your plan: use 5% less electricity/ })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/bills/scan")).toBe(false);
    await goTab("Missions");
    // Smart meter Households get the same 5% plan (ADR-0007), without the typed-reading Forecast.
    expect(await screen.findByRole("heading", { name: "Use 5% less electricity" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/households/${households[1]!.sin}/forecast`)).toBe(false);
    await select(households[0]!.sin);
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    await historyFetched(households[0]!.sin);
    await goTab("Missions");
    expect(await screen.findByRole("heading", { name: "Use 5% less electricity" })).toBeTruthy();
    await goTab("Account");
    expect(await screen.findByRole("heading", { name: "Appliances at home" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/readings"))).toHaveLength(1);
  });

  it("keeps Bills usable if readings fail and expires the session if readings return 401", async () => {
    readingsRequest = async () => response({ error: "Readings unavailable" }, 502);
    render(<App />); await login(); await select(households[1]!.sin);
    await screen.findByText("Readings unavailable");
    expect(screen.getAllByText("Bill verified").length).toBeGreaterThan(0);
    readingsRequest = async () => expired();
    fireEvent.click(screen.getByRole("button", { name: "Retry readings" }));
    await screen.findByText(/Your session expired/);
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    expect(screen.queryByText("Bill verified")).toBeNull();
  });

  it.each(["traditional", "logout"])('ignores late readings after %s', async (action) => {
    let resolve!: (r: Response) => void;
    readingsRequest = () => new Promise((r) => { resolve = r; });
    render(<App />); await login(); await select(households[1]!.sin);
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    const signal = fetchMock.mock.calls.find(([url]) => url.includes("/readings"))![1]!.signal!;
    if (action === "logout") { await goTab("Account"); fireEvent.click(screen.getByRole("button", { name: "Log out" })); }
    else await select(households[0]!.sin);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    await act(async () => resolve(response(usage(households[1]!.sin))));
    expect(screen.queryByText("12.345 kWh")).toBeNull();
  });

  it("logs in, masks Household details, and shows the chosen history without an upload", async () => {
    render(<App />); await login(); await goTab("Account");
    expect(screen.getByRole("option", { name: /Caloocan.*Traditional meter/ }).textContent).toContain("••••••7890");
    expect(document.body.textContent).not.toContain("1234567890");
    await select(households[0]!.sin);
    await historyFetched(households[0]!.sin);
    // The month-by-month Bill History table is no longer shown on Home.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/readings"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url, init]) => url.includes("/households/") && new Headers(init?.headers).get("authorization") === "Bearer test-session")).toBe(true);
  });

  it("ignores a delayed response after switching Households and immediately hides the old history", async () => {
    let resolveFirst!: (r: Response) => void;
    historyRequest = (sin) => sin === households[0]!.sin ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve(response(history(370)));
    render(<App />); await login(); await select(households[0]!.sin);
    await waitFor(() => expect(resolveFirst).toBeTypeOf("function"));
    await select(households[1]!.sin);
    await historyFetched(households[1]!.sin);
    // A late two-Bill History for the old Household must not start its explanation or checks.
    await act(async () => resolveFirst(response([{ ...history(200)[0], period: "2026-09" }, ...history(230)])));
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith(`/api/households/${households[0]!.sin}/`) && /bakit-ganito|check$/.test(url))).toBe(false);
  });

  it("clears protected data on logout and ignores a history response arriving afterward", async () => {
    let resolveHistory!: (r: Response) => void;
    historyRequest = () => new Promise((resolve) => { resolveHistory = resolve; });
    render(<App />); await login(); await select(households[0]!.sin);
    await waitFor(() => expect(resolveHistory).toBeTypeOf("function"));
    await goTab("Account");
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await act(async () => resolveHistory(response(history(230))));
    await screen.findByRole("heading", { name: "Welcome back" });
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
    render(<App />); await login(); await select(households[0]!.sin);
    await waitFor(() => expect(resolveExplanation).toBeTypeOf("function"));
    await select(households[1]!.sin);
    await historyFetched(households[1]!.sin);
    await act(async () => resolveExplanation(response(verdictResponse(11111))));
    expect(screen.queryByText("₱111.11")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Why this bill?" })).toBeNull();
  });

  it("clears the session when a protected request returns 401", async () => {
    historyRequest = async () => expired();
    render(<App />); await signIn();
    await screen.findByText(/Your session expired/);
    expect(screen.queryByRole("heading", { name: "Your Households" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("signed-out users start on Sign up; a login with no linked Household lands on the bill scan (no CAN screen)", async () => {
    loginHouseholds = [];
    render(<App />);
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    await signIn();
    await screen.findByRole("heading", { name: "Scan your latest Meralco bill" });
    expect(screen.queryByLabelText("Customer Account Number")).toBeNull();
    expect(screen.queryByLabelText("Choose a Household")).toBeNull();
  });

  it("signs in with Gmail address + password and shows a wrong-password error", async () => {
    loginFails = true;
    render(<App />);
    await signIn("wrong-pass-1");
    await screen.findByText("The email or password is incorrect.");
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/auth/signin")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ email: "demo@example.com", password: "wrong-pass-1" });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
  });

  it("supports retry after a history error without keeping stale data", async () => {
    failHistory = true;
    render(<App />); await login(); await select(households[0]!.sin);
    await screen.findByText("We couldn't get the Bill History. Please try again.");
    expect(screen.queryByRole("table")).toBeNull();
    failHistory = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await historyFetched(households[0]!.sin, 2);
    await waitFor(() => expect(screen.queryByText("We couldn't get the Bill History. Please try again.")).toBeNull());
  });


  it("switches tabs by hash route and highlights the current tab", async () => {
    render(<App />); await login();
    expect(window.location.hash).toBe("#/home");
    await historyFetched(households[0]!.sin);
    await goTab("Missions");
    expect(await screen.findByRole("heading", { name: "Use 5% less electricity" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    await goTab("Rewards");
    expect(await screen.findByRole("heading", { name: "Rewards" })).toBeTruthy();
    await goTab("Account");
    expect(screen.getByRole("heading", { name: "Your Households" })).toBeTruthy();
    const tabs = within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
    expect(tabs.map((t) => t.textContent)).toEqual(["Home", "Missions", "Rewards", "Account"]);
    expect(tabs.filter((t) => t.getAttribute("aria-current") === "page").map((t) => t.textContent)).toEqual(["Account"]);
  });

  it("a reload keeps the session and the tab", async () => {
    window.sessionStorage.setItem("kuryenteko.token", "test-session");
    window.sessionStorage.setItem("kuryenteko.household", households[1]!.sin);
    window.location.hash = "/rewards";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Rewards" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Rewards" }).getAttribute("aria-current")).toBe("page");
    await goTab("Account");
    expect((screen.getByLabelText("Choose a Household") as HTMLSelectElement).value).toBe(households[1]!.sin);
  });

  it("an expired stored session on reload returns to sign-in with the notice", async () => {
    window.sessionStorage.setItem("kuryenteko.token", "stale");
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => input === "/api/households" ? expired() : originalFetch(input, init));
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back" });
    expect(screen.getByText(/Your session expired/)).toBeTruthy();
    expect(window.sessionStorage.getItem("kuryenteko.token")).toBeNull();
  });

  it("session expiry from any tab returns to sign-in with the notice", async () => {
    render(<App />); await login();
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => /\/(target|usage-plan|forecast|missions|plan)$/.test(input) ? expired() : originalFetch(input, init));
    await goTab("Missions");
    await screen.findByRole("heading", { name: "Welcome back" });
    expect(screen.getByText(/Your session expired/)).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("'Want to save?' opens rewards onboarding; 'Maybe later' returns to Home", async () => {
    setup = setupStatus([false, false, false]);
    render(<App />); await login();
    fireEvent.click(await screen.findByRole("button", { name: /Want to save on your next bill/ }));
    expect(await screen.findByRole("heading", { name: "Use less power. Get rewarded for it." })).toBeTruthy();
    expect(window.location.hash).toBe("#/missions/save");
    expect(screen.getByText(/unlock after your first verified savings/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
    await screen.findByRole("button", { name: /Want to save on your next bill/ });
    expect(window.location.hash).toBe("#/home");
  });

  it("the Missions tab shows the setup checklist until setup is complete, reachable onboarding included", async () => {
    setup = setupStatus([false, false, false]);
    render(<App />); await login();
    await goTab("Missions");
    expect(await screen.findByRole("heading", { name: "Set up your home" })).toBeTruthy();
    expect(screen.getByText("0 of 3 complete · about 2 minutes")).toBeTruthy();
    expect(screen.getByText("🔒 Your missions unlock after setup")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Use 5% less electricity" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Your household/ }));
    expect(await screen.findByRole("heading", { name: "Who lives there?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More people" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(window.location.hash).toBe("#/missions/setup/appliances"));
    const put = fetchMock.mock.calls.find(([url]) => url.endsWith("/setup/household"))!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ size: 4 });
    await act(async () => { window.location.hash = "/missions"; });
    expect(await screen.findByText("1 of 3 complete · about 2 minutes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(await screen.findByRole("heading", { name: "Use less power. Get rewarded for it." })).toBeTruthy();
  });

  it("checklist progress survives a reload (stored per Household on the server)", async () => {
    setup = setupStatus([true, true, false]);
    window.sessionStorage.setItem("kuryenteko.token", "test-session");
    window.location.hash = "/missions";
    render(<App />);
    expect(await screen.findByText("2 of 3 complete · about 2 minutes")).toBeTruthy();
  });
});
