import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { LinkFlow } from "../src/components/LinkFlow";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const summary = { status: "pending", canMasked: "39•• ••• 482", area: "Caloocan City", meterType: "traditional", billsOnRecord: 12, firstPeriod: "2025-11", lastPeriod: "2026-10" };
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;
let link: unknown;

beforeEach(() => {
  link = { status: "active", householdSin: "1234567890", canMasked: "39•• ••• 482" };
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === "/api/households/link" && init?.method === "POST") return response(summary);
    if (input === "/api/households/link") return response({ pending: null });
    if (input === "/api/bills/scan") return response({
      status: "read", now: { period: "2026-10", kwh: 610, billingDays: 33 }, before: null, missing: [], estimated: [],
      serviceIdMasked: null, canMasked: "39•• ••• 482", link, scanToken: "a".repeat(43),
    });
    if (input === "/api/households/link/confirm") return response({ status: "active", householdSin: "1234567890", canMasked: "39•• ••• 482" });
    throw new Error(`Unexpected request: ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function toReview() {
  fireEvent.change(screen.getByLabelText("Customer Account Number"), { target: { value: "3901 234 482" } });
  fireEvent.click(screen.getByRole("button", { name: "Find account" }));
  await screen.findByText("✓ Account found");
  expect(screen.getByText(/12 bills on record/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Now scan your latest bill" });
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["x"], "bill.jpg", { type: "image/jpeg" })] } });
  await screen.findByRole("heading", { name: "Is this right?" });
}

describe("LinkFlow", () => {
  it("types the CAN, scans the bill with the session, shows the match and links", async () => {
    const onLinked = vi.fn();
    render(<LinkFlow token="t" onLinked={onLinked} onExpired={() => {}} />);
    await toReview();
    expect(screen.getByText("Matches linked CAN")).toBeTruthy();
    const scanCall = fetchMock.mock.calls.find(([url]) => url === "/api/bills/scan")!;
    expect((scanCall[1]!.headers as Record<string, string>).Authorization).toBe("Bearer t");
    fireEvent.click(screen.getByRole("button", { name: "Yes, explain my bill" }));
    expect(onLinked).toHaveBeenCalledWith("1234567890");
  });

  it("keeps the link pending for a different account", async () => {
    link = { status: "pending", reason: "differentAccount", canMasked: "39•• ••• 482" };
    render(<LinkFlow token="t" onLinked={() => {}} onExpired={() => {}} />);
    await toReview();
    expect(screen.getByText("Different account")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Yes, explain my bill" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks for the CAN from the bill when the scan cannot read it", async () => {
    link = { status: "pending", reason: "canUnread", canMasked: "39•• ••• 482" };
    const onLinked = vi.fn();
    render(<LinkFlow token="t" onLinked={onLinked} onExpired={() => {}} />);
    await toReview();
    fireEvent.change(screen.getByLabelText("CAN printed on this bill"), { target: { value: "3901234482" } });
    fireEvent.click(screen.getByRole("button", { name: "Check CAN" }));
    await screen.findByText("Matches linked CAN");
    fireEvent.click(screen.getByRole("button", { name: "Yes, explain my bill" }));
    expect(onLinked).toHaveBeenCalledWith("1234567890");
  });
});
