import { findAppliance, type ApplianceType } from "./appliance-catalog.js";
import type { ApplianceInput, TimeRange } from "./appliance-usage.js";

/**
 * Household Setup by tapping appliances and one routine (ADR-0006).
 *
 * The household picks when someone is usually home and when the aircon is on;
 * code turns those two answers into hours per appliance using the tables below.
 * Every value is a documented starting assumption: calibration to the Bill's kWh
 * keeps the total right whatever the per-appliance hours are.
 */
export type HomePattern = "allDay" | "eveningsWeekends" | "daytime";
export type AirconPattern = "sleeping" | "afternoonNight" | "mostOfDay";

/** The tap grid, in display order. Lights are not tapped: every home has them. */
export const GRID_TYPES = [
  "aircon", "refrigerator", "electric_fan", "tv", "washing_machine", "rice_cooker", "flat_iron", "computer", "other",
] as const satisfies readonly ApplianceType[];
export type GridType = (typeof GRID_TYPES)[number];
export const MAX_PER_TYPE = 9;

/** Hours per day an appliance runs, by when someone is home: [first hour on, hours]. Everyday ranges. */
export const HOME_HOURS: Record<HomePattern, Partial<Record<ApplianceType, [start: number, hours: number]>>> = {
  allDay: { tv: [15, 6], electric_fan: [11, 10], lights: [17, 6], computer: [9, 6], other: [18, 3] },
  eveningsWeekends: { tv: [18, 4], electric_fan: [17, 6], lights: [18, 5], computer: [19, 3], other: [19, 2] },
  daytime: { tv: [10, 4], electric_fan: [9, 8], lights: [17, 4], computer: [10, 4], other: [10, 2] },
};

/** Uses per week for appliances counted by use. */
export const HOME_USES: Record<HomePattern, Partial<Record<ApplianceType, number>>> = {
  allDay: { rice_cooker: 14, washing_machine: 3, flat_iron: 3 },
  eveningsWeekends: { rice_cooker: 7, washing_machine: 2, flat_iron: 2 },
  daytime: { rice_cooker: 10, washing_machine: 2, flat_iron: 2 },
};

/** When the aircon runs, as everyday ranges: sleeping 8 h, afternoon + night 12 h, most of the day 16 h. */
export const AIRCON_HOURS: Record<AirconPattern, [start: number, hours: number][]> = {
  sleeping: [[22, 8]],
  afternoonNight: [[13, 4], [22, 8]],
  mostOfDay: [[10, 16]],
};

const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;
const range = ([start, hours]: [number, number]): TimeRange => ({ start: hh(start), end: hh(start + hours), days: "everyday" });

/** Hours per day the routine gives one appliance type (for display and tests). */
export function routineHours(type: ApplianceType, home: HomePattern, aircon: AirconPattern | null): number | null {
  if (type === "aircon") return aircon ? AIRCON_HOURS[aircon].reduce((s, [, h]) => s + h, 0) : null;
  return HOME_HOURS[home][type]?.[1] ?? null;
}

export interface GridInput {
  counts: Partial<Record<GridType, number>>;
  home: HomePattern;
  aircon: AirconPattern | null;
  /** Visual answers for the aircon, e.g. estimated from a photo. */
  airconAnswers?: Record<string, string>;
}

/** The appliance list the tap grid and routine stand for. Lights are always added. */
export function appliancesFromGrid({ counts, home, aircon, airconAnswers }: GridInput): ApplianceInput[] {
  const out: ApplianceInput[] = [];
  const types: ApplianceType[] = [...GRID_TYPES.filter((t) => (counts[t] ?? 0) > 0), "lights"];
  for (const type of types) {
    const def = findAppliance(type)!;
    const quantity = type === "lights" ? 1 : counts[type as GridType]!;
    const item: ApplianceInput = { type, quantity, answers: type === "aircon" && airconAnswers ? { ...airconAnswers } : {} };
    if (def.routine === "timeRanges") {
      item.timeRanges = type === "aircon"
        ? AIRCON_HOURS[aircon ?? "sleeping"].map(range)
        : [range(HOME_HOURS[home][type] ?? [18, 2])];
    }
    if (def.routine === "usesPerWeek") item.usesPerWeek = HOME_USES[home][type] ?? 2;
    out.push(item);
  }
  return out;
}

/** What each grid tile shows: a typical kWh figure, tagged as such (or "Estimated from photo"). */
export function gridCatalog(airconFromPhoto?: number) {
  return GRID_TYPES.map((type) => {
    const def = findAppliance(type)!;
    const photo = type === "aircon" && airconFromPhoto !== undefined;
    return {
      type,
      label: def.label,
      kwh: Math.round((photo ? airconFromPhoto : def.defaultRating) * 1000) / 1000,
      unit: def.routine === "timeRanges" ? "kWh per hour" : def.routine === "usesPerWeek" ? "kWh per use" : "kWh per day",
      tag: photo ? "Estimated from photo" : "Typical value",
    };
  });
}
