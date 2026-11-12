import { describe, expect, it } from "vitest";
import { calibrateToBill, estimateAppliance, hoursPerDay } from "../src/domain/appliance-usage.js";
import {
  AIRCON_HOURS, appliancesFromGrid, GRID_TYPES, HOME_HOURS, HOME_USES, routineHours,
  type AirconPattern, type HomePattern,
} from "../src/domain/routine-presets.js";

const HOMES: HomePattern[] = ["allDay", "eveningsWeekends", "daytime"];
const AIRCONS: AirconPattern[] = ["sleeping", "afternoonNight", "mostOfDay"];
const everything = Object.fromEntries(GRID_TYPES.map((t) => [t, 1]));

describe("routine presets (ADR-0006)", () => {
  it("map each 'someone home' preset to the documented hours per appliance type", () => {
    const documented = {
      allDay: { tv: 6, electric_fan: 10, lights: 6, computer: 6, other: 3 },
      eveningsWeekends: { tv: 4, electric_fan: 6, lights: 5, computer: 3, other: 2 },
      daytime: { tv: 4, electric_fan: 8, lights: 4, computer: 4, other: 2 },
    };
    const uses = {
      allDay: { rice_cooker: 14, washing_machine: 3, flat_iron: 3 },
      eveningsWeekends: { rice_cooker: 7, washing_machine: 2, flat_iron: 2 },
      daytime: { rice_cooker: 10, washing_machine: 2, flat_iron: 2 },
    };
    for (const home of HOMES) {
      for (const [type, hours] of Object.entries(documented[home])) {
        expect([home, type, routineHours(type as never, home, null)]).toEqual([home, type, hours]);
        expect(HOME_HOURS[home][type as never]![1]).toBe(hours);
      }
      expect(HOME_USES[home]).toEqual(uses[home]);
      const list = appliancesFromGrid({ counts: everything, home, aircon: "sleeping" });
      for (const a of list) {
        if (a.timeRanges && a.type !== "aircon") expect([a.type, hoursPerDay(a.timeRanges)]).toEqual([a.type, documented[home][a.type as keyof (typeof documented)[typeof home]]]);
        if (a.usesPerWeek !== undefined) expect(a.usesPerWeek).toBe(uses[home][a.type as keyof (typeof uses)[typeof home]]);
      }
    }
  });

  it("map each aircon preset to 8, 12 and 16 hours a day", () => {
    expect(AIRCONS.map((p) => routineHours("aircon", "allDay", p))).toEqual([8, 12, 16]);
    for (const p of AIRCONS) {
      const aircon = appliancesFromGrid({ counts: { aircon: 2 }, home: "daytime", aircon: p }).find((a) => a.type === "aircon")!;
      expect(hoursPerDay(aircon.timeRanges!)).toBe(AIRCON_HOURS[p].reduce((s, [, h]) => s + h, 0));
      expect(aircon.quantity).toBe(2);
    }
  });

  it("turns the tap grid into appliances with typical values; lights are always included", () => {
    const list = appliancesFromGrid({ counts: { refrigerator: 1, electric_fan: 2 }, home: "allDay", aircon: null });
    expect(list.map((a) => [a.type, a.quantity])).toEqual([["refrigerator", 1], ["electric_fan", 2], ["lights", 1]]);
    expect(list.every((a) => estimateAppliance(a).source === "default")).toBe(true);
    expect(list.some((a) => a.type === "aircon")).toBe(false);
  });

  it("calibrated appliance kWh still sum to the Bill's kWh", () => {
    for (const home of HOMES) {
      for (const kwh of [87, 213.4, 612]) {
        const list = appliancesFromGrid({ counts: everything, home, aircon: "afternoonNight" });
        const rows = calibrateToBill(list.map(estimateAppliance), list, { kwh, billingDays: 31 }, 612_345);
        expect(Math.round(rows.reduce((s, r) => s + r.kwh, 0) * 100)).toBe(Math.round(kwh * 100));
        expect(rows.reduce((s, r) => s + r.pesos, 0)).toBe(612_345);
      }
    }
  });
});
