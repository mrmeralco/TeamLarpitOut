import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillChecks } from "../src/components/BillChecks";
import type { BillChecksResult } from "../src/api/client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const greenData: BillChecksResult = {
  overall: "green",
  checks: [
    {
      key: "lineSum",
      title: "Lines sum to the total",
      status: "pass",
      message: "The lines add up to the total amount.",
    },
    {
      key: "readingContinuity",
      title: "Meter reading continuity (previous vs. present reading)",
      status: "pass",
      message: "The previous reading matches the last Bill's present reading.",
    },
    {
      key: "rateSchedule",
      title: "Rate Schedule fidelity (per-kWh rates vs published table)",
      status: "pass",
      message: "Every per-kWh rate checked matches the published Rate Schedule.",
    },
    {
      key: "paymentReflection",
      title: "Payments made before the Bill date",
      status: "pass",
      message: "Payments made before the bill date are reflected on the Bill.",
    },
  ],
  failedChecks: [],
  summary: "All of Meralco's figures checked match. No discrepancy found.",
};

const redData: BillChecksResult = {
  overall: "red",
  checks: [
    {
      key: "lineSum",
      title: "Lines sum to the total",
      status: "fail",
      message: "The charge lines do not add up to the Total Amount printed on the Bill.",
      discrepancy: {
        labelA: "Sum of the charge lines on the Bill",
        valueA: "₱1050.00",
        labelB: "Total Amount printed on the Bill",
        valueB: "₱1200.00",
      },
    },
    {
      key: "readingContinuity",
      title: "Meter reading continuity (previous vs. present reading)",
      status: "pass",
      message: "The reading matches.",
    },
  ],
  failedChecks: [
    {
      key: "lineSum",
      title: "Lines sum to the total",
      status: "fail",
      message: "The charge lines do not add up to the Total Amount printed on the Bill.",
      discrepancy: {
        labelA: "Sum of the charge lines on the Bill",
        valueA: "₱1050.00",
        labelB: "Total Amount printed on the Bill",
        valueB: "₱1200.00",
      },
    },
  ],
  summary:
    "Good day, Meralco Customer Care.\n\nDiscrepancy: Sum of the charge lines on the Bill: ₱1050.00 vs Total Amount printed on the Bill: ₱1200.00.",
};

const yellowData: BillChecksResult = {
  overall: "yellow",
  checks: [
    {
      key: "lineSum",
      title: "Lines sum to the total",
      status: "pass",
      message: "The lines add up to the total amount.",
    },
    {
      key: "readingContinuity",
      title: "Meter reading continuity (previous vs. present reading)",
      status: "pass",
      message: "The previous reading matches the last Bill's present reading.",
    },
    {
      key: "rateSchedule",
      title: "Rate Schedule fidelity (per-kWh rates vs published table)",
      status: "pass",
      message: "Every per-kWh rate checked matches the published Rate Schedule.",
    },
    {
      key: "paymentReflection",
      title: "Payments made before the Bill date",
      status: "pass",
      message: "Payments made before the bill date are reflected on the Bill.",
    },
  ],
  failedChecks: [],
  summary: "Higher than usual for this weather, but all of Meralco's official figures match.",
  outlier: {
    isOutlier: true,
    dailyKwh: 6.67,
    predictedDailyKwh: 4.0,
    thresholdDailyKwh: 5.2,
    ratio: 1.67,
    hasHouseholdChange: false,
  },
};

describe("BillChecks component", () => {
  it("renders nothing when data is null", () => {
    const { container } = render(<BillChecks data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders green state with all passed checks", () => {
    render(<BillChecks data={greenData} />);
    expect(screen.getByRole("heading", { name: "Is it right? · Bill Checks" })).toBeDefined();
    expect(screen.getByText("✓ Bill verified")).toBeDefined();
    expect(screen.getByText(/Meralco's figures match/)).toBeDefined();
    expect(screen.queryByText("Ask Meralco")).toBeNull();
  });

  it("renders yellow state with 'Did something change at home?' and never points to Meralco", async () => {
    const onReportChange = vi.fn().mockResolvedValue(undefined);
    const onNavigateMissions = vi.fn();

    render(
      <BillChecks
        data={yellowData}
        onReportChange={onReportChange}
        onNavigateMissions={onNavigateMissions}
      />,
    );

    expect(screen.getByText("🟡 Higher than usual")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Did something change at home?" })).toBeDefined();

    // Must NEVER show Meralco inquiry
    expect(screen.queryByText("Ask Meralco")).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy summary/ })).toBeNull();

    // Options exist
    const bisitaBtn = screen.getByRole("button", { name: "We had guests" });
    expect(bisitaBtn).toBeDefined();

    fireEvent.click(bisitaBtn);
    expect(onReportChange).toHaveBeenCalledWith("We had guests");

    // Confirmation shows Missions link
    expect(await screen.findByText(/Reason saved/)).toBeDefined();
    const missionsBtn = screen.getByRole("button", { name: /See Missions/ });
    fireEvent.click(missionsBtn);
    expect(onNavigateMissions).toHaveBeenCalledTimes(1);
  });

  it("renders red state with discrepancy naming two Meralco figures and copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<BillChecks data={redData} />);
    expect(screen.getByText("⚠ Something doesn't match")).toBeDefined();
    expect(screen.getByText(/Meralco's figures don't match/)).toBeDefined();

    // Check discrepancy figures
    expect(screen.getByText("Sum of the charge lines on the Bill")).toBeDefined();
    expect(screen.getByText("₱1050.00")).toBeDefined();
    expect(screen.getByText("Total Amount printed on the Bill")).toBeDefined();
    expect(screen.getByText("₱1200.00")).toBeDefined();

    // "Ask Meralco" section
    expect(screen.getByRole("heading", { name: "Ask Meralco" })).toBeDefined();
    const copyBtn = screen.getByRole("button", { name: /Copy summary/ });
    expect(copyBtn).toBeDefined();

    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith(redData.summary);
    expect(await screen.findByText(/Copied to clipboard!/)).toBeDefined();
  });
});
