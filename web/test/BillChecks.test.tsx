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
      title: "Kabuuan ng mga linya (Lines sum to total)",
      status: "pass",
      message: "Tugma ang kabuuan ng mga linya sa total amount.",
    },
    {
      key: "readingContinuity",
      title: "Continuity ng metro reading (Previous vs Present Reading)",
      status: "pass",
      message: "Tugma ang Previous reading sa Present reading ng nakaraang Bill.",
    },
    {
      key: "rateSchedule",
      title: "Rate Schedule fidelity (per-kWh rates vs published table)",
      status: "pass",
      message: "Lahat ng nasuring per-kWh rates ay tugma sa published Rate Schedule.",
    },
    {
      key: "paymentReflection",
      title: "Pag-reflect ng mga bayad bago ang Bill date",
      status: "pass",
      message: "Naka-reflect sa Bill ang bayad na ginawa bago ang bill date.",
    },
  ],
  failedChecks: [],
  summary: "Lahat ng nasuring Meralco figures ay nagtutugma. Walang nakitang discrepancy.",
};

const redData: BillChecksResult = {
  overall: "red",
  checks: [
    {
      key: "lineSum",
      title: "Kabuuan ng mga linya (Lines sum to total)",
      status: "fail",
      message: "Hindi nagtutugma ang kabuuan ng mga charge lines sa naka-print na Total Amount sa Bill.",
      discrepancy: {
        labelA: "Kabuuan ng Charge Lines sa Bill",
        valueA: "₱1050.00",
        labelB: "Naka-print na Total Amount sa Bill",
        valueB: "₱1200.00",
      },
    },
    {
      key: "readingContinuity",
      title: "Continuity ng metro reading (Previous vs Present Reading)",
      status: "pass",
      message: "Tugma ang reading.",
    },
  ],
  failedChecks: [
    {
      key: "lineSum",
      title: "Kabuuan ng mga linya (Lines sum to total)",
      status: "fail",
      message: "Hindi nagtutugma ang kabuuan ng mga charge lines sa naka-print na Total Amount sa Bill.",
      discrepancy: {
        labelA: "Kabuuan ng Charge Lines sa Bill",
        valueA: "₱1050.00",
        labelB: "Naka-print na Total Amount sa Bill",
        valueB: "₱1200.00",
      },
    },
  ],
  summary:
    "Magandang araw, Meralco Customer Care.\n\nDiscrepancy: Kabuuan ng Charge Lines sa Bill: ₱1050.00 vs Naka-print na Total Amount sa Bill: ₱1200.00.",
};

const yellowData: BillChecksResult = {
  overall: "yellow",
  checks: [
    {
      key: "lineSum",
      title: "Kabuuan ng mga linya (Lines sum to total)",
      status: "pass",
      message: "Tugma ang kabuuan ng mga linya sa total amount.",
    },
    {
      key: "readingContinuity",
      title: "Continuity ng metro reading (Previous vs Present Reading)",
      status: "pass",
      message: "Tugma ang Previous reading sa Present reading ng nakaraang Bill.",
    },
    {
      key: "rateSchedule",
      title: "Rate Schedule fidelity (per-kWh rates vs published table)",
      status: "pass",
      message: "Lahat ng nasuring per-kWh rates ay tugma sa published Rate Schedule.",
    },
    {
      key: "paymentReflection",
      title: "Pag-reflect ng mga bayad bago ang Bill date",
      status: "pass",
      message: "Naka-reflect sa Bill ang bayad na ginawa bago ang bill date.",
    },
  ],
  failedChecks: [],
  summary: "Mas mataas kaysa karaniwan mo para sa ganitong panahon pero tugma ang lahat ng opisyal na numero ng Meralco.",
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
    expect(screen.getByRole("heading", { name: "Tama ba ito? · Bill Checks" })).toBeDefined();
    expect(screen.getByText("✓ Tugma ang bill")).toBeDefined();
    expect(screen.getByText(/Tugma ang mga numero ng Meralco/)).toBeDefined();
    expect(screen.queryByText("Itanong kay Meralco")).toBeNull();
  });

  it("renders yellow state with 'May nagbago ba sa bahay?' and never points to Meralco", async () => {
    const onReportChange = vi.fn().mockResolvedValue(undefined);
    const onNavigateMissions = vi.fn();

    render(
      <BillChecks
        data={yellowData}
        onReportChange={onReportChange}
        onNavigateMissions={onNavigateMissions}
      />,
    );

    expect(screen.getByText("🟡 Mas mataas kaysa karaniwan mo")).toBeDefined();
    expect(screen.getByRole("heading", { name: "May nagbago ba sa bahay?" })).toBeDefined();

    // Must NEVER show Meralco inquiry
    expect(screen.queryByText("Itanong kay Meralco")).toBeNull();
    expect(screen.queryByRole("button", { name: /Kopyahin ang Buod/ })).toBeNull();

    // Options exist
    const bisitaBtn = screen.getByRole("button", { name: "May bisita" });
    expect(bisitaBtn).toBeDefined();

    fireEvent.click(bisitaBtn);
    expect(onReportChange).toHaveBeenCalledWith("May bisita");

    // Confirmation shows Missions link
    expect(await screen.findByText(/Naitala ang dahilan/)).toBeDefined();
    const missionsBtn = screen.getByRole("button", { name: /Tingnan ang Missions/ });
    fireEvent.click(missionsBtn);
    expect(onNavigateMissions).toHaveBeenCalledTimes(1);
  });

  it("renders red state with discrepancy naming two Meralco figures and copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<BillChecks data={redData} />);
    expect(screen.getByText("⚠ May hindi tugma")).toBeDefined();
    expect(screen.getByText(/May nakitang discrepancy sa Meralco figures/)).toBeDefined();

    // Check discrepancy figures
    expect(screen.getByText("Kabuuan ng Charge Lines sa Bill")).toBeDefined();
    expect(screen.getByText("₱1050.00")).toBeDefined();
    expect(screen.getByText("Naka-print na Total Amount sa Bill")).toBeDefined();
    expect(screen.getByText("₱1200.00")).toBeDefined();

    // "Itanong kay Meralco" section
    expect(screen.getByRole("heading", { name: "Itanong kay Meralco" })).toBeDefined();
    const copyBtn = screen.getByRole("button", { name: /Kopyahin ang Buod/ });
    expect(copyBtn).toBeDefined();

    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith(redData.summary);
    expect(await screen.findByText(/Nakopya na sa clipboard!/)).toBeDefined();
  });
});
