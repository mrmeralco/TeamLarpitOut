import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ChargeChat } from "../src/components/ChargeChat";
import type { HomeChargeLine } from "../src/api/client";

const line: HomeChargeLine = {
  id: "generation", label: "Generation", amount: 342000, previous: 301000, change: 41000, kind: "perKwh",
  payee: { type: "passThrough", name: "Power plants" }, goesTo: "Pass-through", printed: ["Generation Charge"],
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let fetchMock: Mock<(input: string, init?: RequestInit) => Promise<Response>>;

beforeEach(() => {
  fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
    const { question } = JSON.parse(String(init!.body));
    if (/file|reklamo/i.test(question)) return response({ lineId: "generation", kind: "askMeralco", source: "template", answer: "KuryenteKo does not file complaints. Ask Meralco.", summary: "Total ₱3,000 vs lines ₱2,690" });
    return response({ lineId: "generation", kind: "answer", source: "template", answer: `Answer to: ${question}` });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ChargeChat", () => {
  it("shows the line's summary and asks a chip question about that line only", async () => {
    render(<ChargeChat token="t" sin="1234567890" line={line} previousMonth="September" onClose={() => {}} onExpired={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Ask about Generation charge" })).toBeTruthy();
    expect(screen.getByText("₱3,420.00")).toBeTruthy();
    expect(screen.getByText("vs. September")).toBeTruthy();
    expect(screen.getByText("+₱410.00")).toBeTruthy();
    expect(screen.getByText("Pass-through")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Why did this go up?" }));
    expect(await screen.findByText("Answer to: Why did this go up?")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/households/1234567890/charges/generation/ask");
    expect(JSON.parse(String(init!.body))).toEqual({ question: "Why did this go up?" });
  });

  it("asks a typed question and shows only the latest answer (stateless)", async () => {
    render(<ChargeChat token="t" sin="1234567890" line={line} previousMonth="September" onClose={() => {}} onExpired={() => {}} />);
    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "Who gets this money?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Answer to: Who gets this money?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Can I lower this?" }));
    expect(await screen.findByText("Answer to: Can I lower this?")).toBeTruthy();
    expect(screen.queryByText("Answer to: Who gets this money?")).toBeNull();
  });

  it("offers the copyable summary for Ask Meralco, never a complaint form", async () => {
    render(<ChargeChat token="t" sin="1234567890" line={line} previousMonth={null} onClose={() => {}} onExpired={() => {}} />);
    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "Can you file a complaint?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/does not file complaints/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy the summary for Meralco" })).toBeTruthy();
  });

  it("shows the official Meralco explanation under the answer when retrieval found one", async () => {
    fetchMock.mockImplementationOnce(async () => response({
      lineId: "generation", kind: "answer", source: "ai", answer: "It went up because you used more.",
      sources: [{ title: "Generation Charge", text: "The cost of power Meralco buys from power producers.", url: "https://www.meralco.com.ph/residential/understand-your-bill" }],
    }));
    render(<ChargeChat token="t" sin="1234567890" line={line} previousMonth={null} onClose={() => {}} onExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Why did this go up?" }));
    expect(await screen.findByText("From Meralco's bill guide: Generation Charge")).toBeTruthy();
    expect(screen.getByText("The cost of power Meralco buys from power producers.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "meralco.com.ph" }).getAttribute("href")).toBe("https://www.meralco.com.ph/residential/understand-your-bill");
  });

  it("shows no source box when retrieval had nothing", async () => {
    render(<ChargeChat token="t" sin="1234567890" line={line} previousMonth={null} onClose={() => {}} onExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Why did this go up?" }));
    await screen.findByText("Answer to: Why did this go up?");
    expect(screen.queryByText(/From Meralco's bill guide/)).toBeNull();
  });

  it("closes with the close button", () => {
    const onClose = vi.fn();
    render(<ChargeChat token="t" sin="1234567890" line={line} previousMonth={null} onClose={onClose} onExpired={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
