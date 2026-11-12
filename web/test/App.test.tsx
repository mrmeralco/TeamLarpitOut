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
const expired = () => response({ error: "Mag-login muna gamit ang My Meralco." }, 401);
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
let historyRequest: (sin: string) => Promise<Response>;
let loginHouseholds = households;
let linkage: { status: string; householdSin?: string };
let loginFails = false;
let failHistory = false;

beforeEach(() => {
  historyRequest = async (sin) => response(history(sin === households[0]!.sin ? 230 : 370));
  loginHouseholds = households;
  linkage = { status: "unlinked" };
  loginFails = false; failHistory = false;
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/rate-schedules") return response({ periods: ["2026-09", "2026-10", "2026-11"] });
    if (input === "/api/auth/login") return loginFails ? response({ error: "Hindi tama ang email o password." }, 401) : response({ token: "test-session", households: loginHouseholds });
    if (input === "/api/auth/logout") return new Response(null, { status: 204 });
    const match = /^\/api\/households\/([^/]+)\/bills$/.exec(input);
    if (match) return failHistory ? response({ error: "Hindi makuha ang Bill History. Subukan ulit." }, 502) : historyRequest(match[1]!);
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

async function login() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "kuryenteko-demo" } });
  fireEvent.click(screen.getByRole("button", { name: "Mag-login" }));
  await screen.findByRole("heading", { name: "Mga Household mo" });
}
function select(sin: string) { fireEvent.change(screen.getByLabelText("Piliin ang Household"), { target: { value: sin } }); }
async function scanAndConfirm() {
  const photo = new File(["fake-jpeg"], "bill.jpg", { type: "image/jpeg" });
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [photo] } });
  fireEvent.click(await screen.findByRole("button", { name: "Oo, tama" }));
}

describe("My Meralco PWA", () => {
  it("logs in, masks Household details, and shows the chosen history without an upload", async () => {
    render(<App />); await login();
    expect(screen.getByRole("option", { name: /Caloocan.*Traditional meter/ }).textContent).toContain("••••••7890");
    expect(document.body.textContent).not.toContain("1234567890");
    select(households[0]!.sin);
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("cell", { name: "230" })).toBeTruthy();
    expect(screen.getByText(/Hindi ito totoong Bill History/)).toBeTruthy();
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
    await screen.findByRole("heading", { name: "Mag-login gamit ang My Meralco" });
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
    expect(screen.getByText(/Walang naka-link na Household/)).toBeTruthy();
    expect(screen.queryByLabelText("Piliin ang Household")).toBeNull();
  });

  it("shows a login error and keeps the quick-verdict entry point available", async () => {
    loginFails = true;
    render(<App />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "wrong@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Mag-login" }));
    await screen.findByText("Hindi tama ang email o password.");
    expect(screen.getByRole("button", { name: /I-scan ang Bill/ })).toBeTruthy();
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
