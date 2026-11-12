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
  window.sessionStorage.clear();
  window.location.hash = "";
  historyRequest = async (sin) => response(history(sin === households[0]!.sin ? 230 : 370));
  readingsRequest = async (sin) => response(usage(sin));
  loginHouseholds = households;
  loginFails = false; failHistory = false;
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/rate-schedules") return response({ periods: ["2026-09", "2026-10", "2026-11"] });
    if (input === "/api/auth/email/start") return response({ sent: true, expiresInSeconds: 600 }, 202);
    if (input === "/api/auth/email/verify") return loginFails ? response({ error: "Mali o expired na ang code. Humingi ng bagong code." }, 401) : response({ token: "test-session" });
    if (input === "/api/households") return response(loginHouseholds);
    if (input === "/api/households/link") return response({ pending: null });
    if (/^\/api\/households\/[^/]+\/rewards$/.test(input)) return response({ sin: "x", balance: 0, tag: "sample rewards", disclaimer: "Sample.", catalog: [], history: [] });
    if (input === "/api/auth/logout") return new Response(null, { status: 204 });
    const match = /^\/api\/households\/([^/]+)\/bills$/.exec(input);
    if (match) return failHistory ? response({ error: "Hindi makuha ang Bill History. Subukan ulit." }, 502) : historyRequest(match[1]!);
    const readingsMatch = /^\/api\/households\/([^/]+)\/readings\?interval=(hour|day|week)$/.exec(input);
    if (readingsMatch) return readingsRequest(readingsMatch[1]!);
    if (input === "/api/appliances/catalog") return response({ appliances: [] });
    if (/^\/api\/households\/[^/]+\/appliances$/.test(input)) return response({ saved: false, updatedAt: null, appliances: [] });
    if (/^\/api\/households\/[^/]+\/home$/.test(input)) return response({
      meterType: input.includes(households[0]!.sin) ? "traditional" : "smart", canMasked: "39•• ••• 482", area: "Caloocan City",
      chargeLines: { featured: [], all: [] },
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
  fireEvent.change(screen.getByLabelText("Piliin ang Household"), { target: { value: sin } });
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
    expect(screen.getByRole("cell", { name: "370" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Want to save on your next bill/ })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/bills/scan")).toBe(false);
    await goTab("Missions");
    expect(screen.queryByRole("heading", { name: "Target at Missions" })).toBeNull();
    await select(households[0]!.sin);
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    await screen.findByRole("cell", { name: "230" });
    await goTab("Missions");
    expect(await screen.findByRole("heading", { name: "Target at Missions" })).toBeTruthy();
    await goTab("Account");
    expect(await screen.findByRole("heading", { name: "Mga appliance sa bahay" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/readings"))).toHaveLength(1);
  });

  it("keeps Bills usable if readings fail and expires the session if readings return 401", async () => {
    readingsRequest = async () => response({ error: "Readings unavailable" }, 502);
    render(<App />); await login(); await select(households[1]!.sin);
    await screen.findByText("Readings unavailable");
    expect(screen.getByRole("cell", { name: "370" })).toBeTruthy();
    readingsRequest = async () => expired();
    fireEvent.click(screen.getByRole("button", { name: "Subukan ulit ang readings" }));
    await screen.findByText(/Nag-expire ang session/);
    expect(screen.queryByRole("region", { name: "Smart meter usage" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it.each(["traditional", "logout"])('ignores late readings after %s', async (action) => {
    let resolve!: (r: Response) => void;
    readingsRequest = () => new Promise((r) => { resolve = r; });
    render(<App />); await login(); await select(households[1]!.sin);
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    const signal = fetchMock.mock.calls.find(([url]) => url.includes("/readings"))![1]!.signal!;
    if (action === "logout") { await goTab("Account"); fireEvent.click(screen.getByRole("button", { name: "Mag-logout" })); }
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
    render(<App />); await login(); await select(households[0]!.sin);
    await waitFor(() => expect(resolveFirst).toBeTypeOf("function"));
    await select(households[1]!.sin);
    await screen.findByRole("cell", { name: "370" });
    await act(async () => resolveFirst(response(history(230))));
    expect(screen.queryByRole("cell", { name: "230" })).toBeNull();
    expect(screen.getByRole("heading", { name: /Bill History/ }).textContent).toContain("••••••3210");
  });

  it("clears protected data on logout and ignores a history response arriving afterward", async () => {
    let resolveHistory!: (r: Response) => void;
    historyRequest = () => new Promise((resolve) => { resolveHistory = resolve; });
    render(<App />); await login(); await select(households[0]!.sin);
    await waitFor(() => expect(resolveHistory).toBeTypeOf("function"));
    await goTab("Account");
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
    render(<App />); await login(); await select(households[0]!.sin);
    await waitFor(() => expect(resolveExplanation).toBeTypeOf("function"));
    await select(households[1]!.sin);
    await screen.findByRole("cell", { name: "370" });
    await act(async () => resolveExplanation(response(verdictResponse(11111))));
    expect(screen.queryByText("₱111.11")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Bakit ganito?" })).toBeNull();
  });

  it("clears the session when a protected request returns 401", async () => {
    historyRequest = async () => expired();
    render(<App />); await enterCode();
    await screen.findByText(/Nag-expire ang session/);
    expect(screen.queryByRole("heading", { name: "Mga Household mo" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a login with no linked Household lands on Link CAN; signed-out users only see sign-in", async () => {
    loginHouseholds = [];
    render(<App />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText(/walang login|Quick verdict/i)).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    await enterCode();
    await screen.findByRole("heading", { name: "Link your Meralco account" });
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
    render(<App />); await login(); await select(households[0]!.sin);
    await screen.findByText("Hindi makuha ang Bill History. Subukan ulit.");
    expect(screen.queryByRole("table")).toBeNull();
    failHistory = false;
    fireEvent.click(screen.getByRole("button", { name: "Subukan ulit" }));
    await screen.findByRole("cell", { name: "230" });
  });


  it("switches tabs by hash route and highlights the current tab", async () => {
    render(<App />); await login();
    expect(window.location.hash).toBe("");
    await screen.findByRole("cell", { name: "230" });
    await goTab("Missions");
    expect(await screen.findByRole("heading", { name: "Target at Missions" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    await goTab("Rewards");
    expect(await screen.findByRole("heading", { name: "Rewards" })).toBeTruthy();
    await goTab("Account");
    expect(screen.getByRole("heading", { name: "Mga Household mo" })).toBeTruthy();
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
    expect((screen.getByLabelText("Piliin ang Household") as HTMLSelectElement).value).toBe(households[1]!.sin);
  });

  it("an expired stored session on reload returns to sign-in with the notice", async () => {
    window.sessionStorage.setItem("kuryenteko.token", "stale");
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => input === "/api/households" ? expired() : originalFetch(input, init));
    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.getByText(/Nag-expire ang session/)).toBeTruthy();
    expect(window.sessionStorage.getItem("kuryenteko.token")).toBeNull();
  });

  it("session expiry from any tab returns to sign-in with the notice", async () => {
    render(<App />); await login();
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => /\/(target|usage-plan|forecast|missions)$/.test(input) ? expired() : originalFetch(input, init));
    await goTab("Missions");
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.getByText(/Nag-expire ang session/)).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});
