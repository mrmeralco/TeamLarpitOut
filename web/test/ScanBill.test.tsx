import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ScanBill } from "../src/components/ScanBill";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
let account: unknown;
let canMasked: string | null;

beforeEach(() => {
  account = { status: "found", canMasked: "39•• ••• 482", area: "Caloocan City", meterType: "traditional", billsOnRecord: 12, firstPeriod: "2025-11", lastPeriod: "2026-10" };
  canMasked = "39•• ••• 482";
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/bills/scan" || input === "/api/bills/simulate") return response({
      status: "read", now: { period: "2026-10", kwh: 610, billingDays: 33, dueDate: "2026-11-24", chargeLines: [{ label: "Generation", amount: 6817 }] },
      before: { period: "2026-09", kwh: 520, billingDays: 33 }, missing: [], estimated: ["before.billingDays"],
      serviceIdMasked: null, canMasked, account, scanToken: "a".repeat(43),
    });
    if (input === "/api/households/link/confirm") return response({ status: "active", householdSin: "1234567890", canMasked: "39•• ••• 482" });
    throw new Error(`Unexpected ${input} ${init?.method}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function scan() {
  render(<ScanBill token="t" onLinked={onLinked} onExpired={() => {}} />);
  expect(screen.getByRole("heading", { name: "Scan your latest Meralco bill" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Take photo" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Upload from gallery" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Take a photo of the bill"), { target: { files: [new File(["x"], "bill.jpg", { type: "image/jpeg" })] } });
  await screen.findByRole("heading", { name: "Does this look right?" });
}
let onLinked = vi.fn();
beforeEach(() => { onLinked = vi.fn(); });

describe("Scan and confirm (mockup screens 5–6)", () => {
  it("reads the CAN from the bill, shows both months, and links on 'Yes, explain my bill'", async () => {
    await scan();
    expect(screen.getByText("39•• ••• 482")).toBeTruthy();
    expect(screen.getByText("Read from your bill")).toBeTruthy();
    expect(screen.getByText("Caloocan City · Traditional meter · 12 bills")).toBeTruthy();
    expect(screen.getByText("September")).toBeTruthy();
    expect(screen.getByText("October")).toBeTruthy();
    expect((screen.getByLabelText("Usage (kWh)") as HTMLInputElement).value).toBe("610");
    expect((screen.getByLabelText("Total due") as HTMLInputElement).value).toBe("₱6,817.00");
    expect(screen.getByText("520")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, explain my bill" }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith("1234567890"));
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/households/link/confirm")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ scanToken: "a".repeat(43) });
  });

  it("asks for the CAN printed on the bill when the scan couldn't read it", async () => {
    account = { status: "canUnread" }; canMasked = null;
    await scan();
    expect(screen.getByText("CAN not read")).toBeTruthy();
    const yes = screen.getByRole("button", { name: "Yes, explain my bill" }) as HTMLButtonElement;
    expect(yes.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type the CAN printed on this bill"), { target: { value: "3901 234 482" } });
    fireEvent.click(yes);
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/households/link/confirm")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ scanToken: "a".repeat(43), can: "3901 234 482" });
  });

  it("can't link a bill whose CAN is unknown", async () => {
    account = { status: "unknownAccount", canMasked: "39•• ••• 482" };
    await scan();
    expect(screen.getByText("Account not found")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Yes, explain my bill" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Back from the review returns to the camera", async () => {
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Scan your latest Meralco bill" })).toBeTruthy();
  });

  it("supports float 2f decimals on bill charges, total due, and usage", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input !== "/api/bills/scan") return original(input, init);
      const body = await (await original(input, init)).json();
      return response({
        ...body,
        now: {
          ...body.now,
          kwh: 610.75,
          chargeLines: [
            { label: "Generation", amount: 4500.5 },
            { label: "Distribution", amount: 2316.95 },
          ],
        },
      });
    });
    await scan();
    expect((screen.getByLabelText("Usage (kWh)") as HTMLInputElement).value).toBe("610.75");
    expect((screen.getByLabelText("Total due") as HTMLInputElement).value).toBe("₱6,817.45");

    fireEvent.change(screen.getByLabelText("Total due"), { target: { value: "₱6,820.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, explain my bill" }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith("1234567890"));
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/households/link/confirm")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ scanToken: "a".repeat(43), totalAmount: 6820.5 });
  });
});

describe("demo fallback", () => {
  it("labels an unknown CAN as a demo account and still links", async () => {
    account = { status: "found", demo: true, canMasked: "55•• ••• 678", area: "Caloocan City", meterType: "traditional", billsOnRecord: 12, firstPeriod: "2025-11", lastPeriod: "2026-10" };
    canMasked = "55•• ••• 678";
    await scan();
    expect(screen.getByText("Demo account")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/explains this bill as your latest bill.*sample Caloocan City values/);
    // Corrections from "Does this look right?" go along with the confirmation.
    fireEvent.change(screen.getByLabelText("Usage (kWh)"), { target: { value: "615" } });
    fireEvent.change(screen.getByLabelText("Total due"), { target: { value: "₱6,900" } });
    fireEvent.change(screen.getByLabelText("Billing days"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, explain my bill" }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith("1234567890"));
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/households/link/confirm")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ scanToken: "a".repeat(43), kwh: 615, totalAmount: 6900 });
  });

  it("demo mode asks for the billing days the scan missed before it can explain the bill", async () => {
    account = { status: "found", demo: true, canMasked: "55•• ••• 678", area: "Caloocan City", meterType: "traditional", billsOnRecord: 12, firstPeriod: "2025-11", lastPeriod: "2026-10" };
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input !== "/api/bills/scan") return original(input, init);
      const body = await (await original(input, init)).json();
      return response({ ...body, now: { ...body.now, billingDays: undefined }, missing: ["billingDays"] });
    });
    await scan();
    const confirm = screen.getByRole("button", { name: "Yes, explain my bill" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByText(/couldn't read the billing days/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Billing days"), { target: { value: "31" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/households/link/confirm")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ scanToken: "a".repeat(43), billingDays: 31 });
  });

  it("an already-linked demo account is confirmed again, so a newer scan becomes the latest bill", async () => {
    account = { status: "alreadyLinked", householdSin: "8512345678", demo: true, canMasked: "55•• ••• 678", area: "Caloocan City", meterType: "traditional", billsOnRecord: 12, firstPeriod: "2025-11", lastPeriod: "2026-10" };
    await scan();
    fireEvent.click(screen.getByRole("button", { name: "Yes, explain my bill" }));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/households/link/confirm")).toBe(true);
  });

  it("renders a Log out button when onLogout is provided and invokes it on click", () => {
    const onLogout = vi.fn();
    render(<ScanBill token="t" onLinked={onLinked} onExpired={() => {}} onLogout={onLogout} />);
    const logoutBtn = screen.getByRole("button", { name: "Log out" });
    expect(logoutBtn).toBeTruthy();
    fireEvent.click(logoutBtn);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("loads simulated bill data when clicking 'Simulate bill data'", async () => {
    render(<ScanBill token="t" onLinked={onLinked} onExpired={() => {}} />);
    const simBtn = screen.getByRole("button", { name: /Simulate bill data/i });
    fireEvent.click(simBtn);
    await screen.findByRole("heading", { name: "Does this look right?" });
    expect(screen.getByText("39•• ••• 482")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/bills/simulate", expect.anything());
  });

  it("allows proceeding with simulated bill data when scan encounters quota/network error", async () => {
    fetchMock.mockImplementationOnce(async (input: string) => {
      if (input === "/api/bills/scan") {
        return response({ status: "unavailable", error: "Vision AI quota limit reached. Please use simulated bill data to proceed." }, 502);
      }
      return response({});
    });

    render(<ScanBill token="t" onLinked={onLinked} onExpired={() => {}} />);
    fireEvent.change(screen.getByLabelText("Take a photo of the bill"), { target: { files: [new File(["x"], "bill.jpg", { type: "image/jpeg" })] } });
    await screen.findByRole("alert");
    expect(screen.getByText(/Vision AI quota limit reached/)).toBeTruthy();

    const continueBtn = screen.getByRole("button", { name: "Continue with simulated bill" });
    fireEvent.click(continueBtn);
    await screen.findByRole("heading", { name: "Does this look right?" });
    expect(screen.getByText("39•• ••• 482")).toBeTruthy();
  });
});
