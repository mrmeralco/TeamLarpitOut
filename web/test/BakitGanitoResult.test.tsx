import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BakitGanitoResult } from "../src/components/BakitGanitoResult";
import type { BakitGanito } from "../src/api/client";

afterEach(cleanup);

const result: BakitGanito = {
  before: { period: "2026-09", kwh: 150, billingDays: 30, rebuiltTotal: 150000, printedTotal: null, estimated: false, extras: [], extrasTotal: 0 },
  now: { period: "2026-10", kwh: 200, billingDays: 31, rebuiltTotal: 200000, printedTotal: null, estimated: false, extras: [], extrasTotal: 0 },
  effects: [
    { key: "rate", label: "Rate Effect", amount: 10000 },
    { key: "billingDays", label: "Billing Days Effect", amount: 10000 },
    { key: "weather", label: "Weather Effect (tantya)", amount: 15000, estimate: true, sensitivity: 1.5, sensitivitySource: "history", hotDayKwh: 1.5 },
    { key: "habit", label: "Habit Effect", amount: 15000 },
  ],
  lines: [], habitMeasurable: true, total: 50000, printedChange: null, extrasChange: 0, unexplained: null,
};

describe("BakitGanitoResult", () => {
  it("taps the Weather Effect to reveal bawat mas mainit na araw", () => {
    render(<BakitGanitoResult r={result} />);
    const weatherRow = screen.getByRole("button", { name: /Weather Effect/ });
    expect(weatherRow.textContent).toContain("Epekto ng init ng panahon (tantya)");
    fireEvent.click(weatherRow);
    expect(weatherRow.textContent).toContain("bawat mas mainit na araw ≈ +1.5 kWh mula sa sariling mga Bill");
    fireEvent.click(weatherRow);
    expect(weatherRow.textContent).toContain("Epekto ng init ng panahon (tantya)");
    expect(screen.getByText("✓ Tugma sa totoong pagbabago ng Bill")).toBeTruthy();
  });
});
