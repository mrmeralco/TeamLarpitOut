import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        sourceLabel: "Mula sa energy label", kwh: 240, pesos: 264000, share: 1 }],
      totals: { kwh: 240, perKwhCharges: 264000, fixedCharges: 5000 },
    });
    return response({ saved: true, updatedAt: "2026-11-12", appliances: [
      { type: "refrigerator", quantity: 1, answers: {}, energyLabel, source: "label", sourceLabel: "Mula sa energy label" },
    ] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Appliances token="test-token" household={{
    sin: "1234567890", masked_address: "••• Manila", meter_type: "traditional",
  }} onExpired={vi.fn()} />);
  expect(await screen.findByText("Mula sa energy label")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Baguhin ang mga appliance" }));
  fireEvent.change(screen.getByLabelText("Ilan"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "I-save at tingnan kung saan napupunta" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
  const [url, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(url).toBe("/api/households/1234567890/appliances");
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
  expect(JSON.parse(String(init?.body))).toEqual({ appliances: [{
    type: "refrigerator", quantity: 2, answers: {}, energyLabel: {
      consumptionKwh: 30, period: "monthly", referenceDays: 30, confirmed: true,
    },
  }] });
  await screen.findByText("Mula sa energy label");
});
