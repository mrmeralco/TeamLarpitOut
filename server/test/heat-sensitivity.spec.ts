import { describe, expect, it } from "vitest";
import {
  calculateHeatSensitivity,
  DEFAULT_COOLING_SENSITIVITY,
  estimateAirconHoursFromHistory,
} from "../src/domain/heat-sensitivity.js";

describe("calculateHeatSensitivity", () => {
  it("falls back to cooling appliance estimate when history has fewer than 3 bills", () => {
    const res = calculateHeatSensitivity([
      { kwh: 100, billingDays: 30, cddPerDay: 4.0 },
      { kwh: 110, billingDays: 30, cddPerDay: 4.5 },
    ]);
    expect(res.source).toBe("cooling_appliance_estimate");
    expect(res.heatSensitivity).toBe(DEFAULT_COOLING_SENSITIVITY);
    expect(res.hotDayKwh).toBe(DEFAULT_COOLING_SENSITIVITY);
  });

  it("falls back to cooling appliance estimate when CDD has zero variance", () => {
    const res = calculateHeatSensitivity([
      { kwh: 100, billingDays: 30, cddPerDay: 4.0 },
      { kwh: 120, billingDays: 30, cddPerDay: 4.0 },
      { kwh: 110, billingDays: 30, cddPerDay: 4.0 },
    ]);
    expect(res.source).toBe("cooling_appliance_estimate");
    expect(res.heatSensitivity).toBe(DEFAULT_COOLING_SENSITIVITY);
  });

  it("recovers exact slope from linear data", () => {
    const cdds = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];
    const slope = 1.8;
    const base = 5.0;
    const bills = cdds.map((cdd) => ({
      billingDays: 30,
      cddPerDay: cdd,
      kwh: (base + slope * cdd) * 30,
    }));

    const res = calculateHeatSensitivity(bills);
    expect(res.source).toBe("history");
    expect(res.heatSensitivity).toBe(1.8);
    expect(res.hotDayKwh).toBe(1.8);
    expect(res.label).toBe("Mula sa Bill History");
  });

  it("clamps negative slope to zero", () => {
    // Inverse relationship: higher CDD had lower consumption
    const bills = [
      { kwh: 300, billingDays: 30, cddPerDay: 3.0 },
      { kwh: 200, billingDays: 30, cddPerDay: 5.0 },
      { kwh: 100, billingDays: 30, cddPerDay: 7.0 },
    ];
    const res = calculateHeatSensitivity(bills);
    expect(res.source).toBe("history");
    expect(res.heatSensitivity).toBe(0);
  });
});

describe("estimateAirconHoursFromHistory", () => {
  it("calculates aircon hours from cooling part divided by aircon kW", () => {
    // 12 months with mean CDD = 4.0
    const cdds = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 3.5, 4.0, 4.5];
    const slope = 2.0; // 2.0 kWh/CDD
    const base = 10.0; // 10 kWh/day base load
    // Daily kWh = 10 + 2 * CDD. Mean CDD = 4.0 -> cooling = 2.0 * 4.0 = 8.0 kWh/day
    const bills = cdds.map((cdd) => ({
      billingDays: 30,
      cddPerDay: cdd,
      kwh: (base + slope * cdd) * 30,
    }));

    const result = estimateAirconHoursFromHistory(bills, 1.0); // 1.0 kW aircon
    expect(result).not.toBeNull();
    expect(result!.coolingKwhPerDay).toBe(8.0);
    expect(result!.hours).toBe(8);
  });

  it("returns null when history has fewer than 3 bills", () => {
    const bills = [
      { billingDays: 30, cddPerDay: 4.0, kwh: 300 },
      { billingDays: 30, cddPerDay: 4.5, kwh: 330 },
    ];
    expect(estimateAirconHoursFromHistory(bills, 1.0)).toBeNull();
  });

  it("returns null when aircon kW is invalid or slope is zero", () => {
    const cdds = [3.0, 4.0, 5.0];
    const bills = cdds.map((cdd) => ({ billingDays: 30, cddPerDay: cdd, kwh: 300 }));
    expect(estimateAirconHoursFromHistory(bills, 0)).toBeNull();
    // Flat consumption -> slope 0 -> cooling 0 -> null
    expect(estimateAirconHoursFromHistory(bills, 1.0)).toBeNull();
  });
});
