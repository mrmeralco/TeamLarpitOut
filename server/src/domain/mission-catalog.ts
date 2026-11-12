import type { ApplianceType } from "./appliance-catalog.js";

/**
 * The Mission catalog (plan §2.5). Code computes every kWh and peso value from
 * the household's own appliances; the Coach only words them.
 *
 * Rates without a DOE or Meralco source are ASSUMPTIONS and are returned with
 * the Mission so the app can label them, until the team finds a source.
 */

/** One appliance type's use over the coming billing period, calibrated to the Bill. */
export interface ApplianceUsage {
  type: ApplianceType;
  quantity: number;
  /** kWh over the period, calibrated so all appliances add up to the Bill. */
  kwh: number;
  /** Average hours per day (time-range routines); null otherwise. */
  hoursPerDay: number | null;
  usesPerWeek: number | null;
  /** The catalog rating before calibration (kW for time-range appliances). */
  rating: number;
}

export interface MissionContext {
  billingDays: number;
  usage: ApplianceUsage[];
  /** The aircon's current temperature setting, if the household told us. */
  airconSetting?: number;
}

export interface Assumption {
  key: string;
  label: string;
  value: number;
}

export interface MissionDefinition {
  id: string;
  title: string;
  appliance: ApplianceType;
  /** "physics": from the appliance's own figures; "assumption": uses an unsourced rate. */
  basis: "physics" | "assumption";
  /** kWh saved over the period, or null when the Mission doesn't apply to this household. */
  kwhSaved: (ctx: MissionContext) => { kwh: number; assumptions: Assumption[] } | null;
}

/** Assumed rates (labelled in the app). */
export const ASSUMED = {
  /** Share of aircon energy saved per °C warmer. */
  airconPerDegree: 0.03,
  /** Aircon setting assumed when the household hasn't said. */
  airconSetting: 22,
  /** TV and gadget standby draw, watts per TV. */
  standbyWatts: 5,
  /** Hours of lights cut per day in empty rooms. */
  lightHoursCut: 1,
  /** Share of ironing energy saved by ironing once a week (one heat-up). */
  ironBatch: 0.2,
  /** Loads saved per week by washing full loads only. */
  washLoadsCutPerWeek: 1,
  /** Share of ref energy saved at a medium setting. */
  refMedium: 0.1,
  /** Electric fan draw when the household has no fan in its list (kW). */
  fanKw: 0.065,
} as const;

function sum(ctx: MissionContext, type: ApplianceType) {
  const items = ctx.usage.filter((u) => u.type === type);
  const kwh = items.reduce((s, u) => s + u.kwh, 0);
  const quantity = items.reduce((s, u) => s + u.quantity, 0);
  // kWh-weighted hours, so the appliance that uses more counts more.
  const hours = kwh > 0 ? items.reduce((s, u) => s + (u.hoursPerDay ?? 0) * u.kwh, 0) / kwh : 0;
  const uses = items.reduce((s, u) => s + (u.usesPerWeek ?? 0), 0);
  return { items, kwh, quantity, hours, uses };
}

export const MISSION_CATALOG: MissionDefinition[] = [
  {
    id: "aircon-25c",
    title: "Set the aircon to 25°C",
    appliance: "aircon",
    basis: "assumption",
    kwhSaved: (ctx) => {
      const ac = sum(ctx, "aircon");
      if (ac.kwh <= 0) return null;
      const told = ctx.airconSetting !== undefined;
      const setting = ctx.airconSetting ?? ASSUMED.airconSetting;
      if (setting >= 25) return null;
      const assumptions: Assumption[] = [
        { key: "airconPerDegree", label: "Savings per 1°C warmer (assumption)", value: ASSUMED.airconPerDegree },
      ];
      if (!told) assumptions.push({ key: "airconSetting", label: "Current setting (assumption)", value: setting });
      return { kwh: ac.kwh * ASSUMED.airconPerDegree * (25 - setting), assumptions };
    },
  },
  {
    id: "aircon-timer-2h",
    title: "Aircon timer 2 hours earlier",
    appliance: "aircon",
    basis: "physics",
    kwhSaved: (ctx) => {
      const ac = sum(ctx, "aircon");
      if (ac.kwh <= 0 || ac.hours <= 0) return null;
      return { kwh: (ac.kwh * Math.min(2, ac.hours)) / ac.hours, assumptions: [] };
    },
  },
  {
    id: "aircon-off-1h",
    title: "Turn off the aircon 1 hour earlier",
    appliance: "aircon",
    basis: "physics",
    kwhSaved: (ctx) => {
      const ac = sum(ctx, "aircon");
      if (ac.kwh <= 0 || ac.hours <= 1) return null;
      return { kwh: ac.kwh / ac.hours, assumptions: [] };
    },
  },
  {
    id: "tv-hour-less",
    title: "Watch TV 1 hour less a day",
    appliance: "tv",
    basis: "physics",
    kwhSaved: (ctx) => {
      const tv = sum(ctx, "tv");
      if (tv.kwh <= 0 || tv.hours <= 1) return null;
      return { kwh: tv.kwh / tv.hours, assumptions: [] };
    },
  },
  {
    id: "fan-first-hour",
    title: "Use the electric fan for the first hour before the aircon",
    appliance: "aircon",
    basis: "physics",
    kwhSaved: (ctx) => {
      const ac = sum(ctx, "aircon");
      if (ac.kwh <= 0 || ac.hours < 1) return null;
      const airconKw = ac.kwh / (ac.hours * ctx.billingDays);
      const fans = sum(ctx, "electric_fan").items;
      const assumptions: Assumption[] = [];
      let fanKw = fans[0]?.rating;
      if (fanKw === undefined) {
        fanKw = ASSUMED.fanKw;
        assumptions.push({ key: "fanKw", label: "Electric fan power, kW (typical)", value: fanKw });
      }
      const kwh = Math.max(0, airconKw - fanKw) * ctx.billingDays;
      return kwh > 0 ? { kwh, assumptions } : null;
    },
  },
  {
    id: "unplug-standby",
    title: "Unplug the TV and chargers at night",
    appliance: "tv",
    basis: "assumption",
    kwhSaved: (ctx) => {
      const tv = sum(ctx, "tv");
      if (tv.quantity <= 0) return null;
      return {
        kwh: (ASSUMED.standbyWatts * tv.quantity * 8 * ctx.billingDays) / 1000,
        assumptions: [{ key: "standbyWatts", label: "TV standby, watts (assumption)", value: ASSUMED.standbyWatts }],
      };
    },
  },
  {
    id: "lights-off",
    title: "Lights off in empty rooms",
    appliance: "lights",
    basis: "assumption",
    kwhSaved: (ctx) => {
      const lights = sum(ctx, "lights");
      if (lights.kwh <= 0 || lights.hours < ASSUMED.lightHoursCut) return null;
      const kw = lights.kwh / (lights.hours * ctx.billingDays);
      return {
        kwh: kw * ASSUMED.lightHoursCut * ctx.billingDays,
        assumptions: [{ key: "lightHoursCut", label: "Hours cut per day (assumption)", value: ASSUMED.lightHoursCut }],
      };
    },
  },
  {
    id: "iron-batch",
    title: "Iron clothes once a week, all at once",
    appliance: "flat_iron",
    basis: "assumption",
    kwhSaved: (ctx) => {
      const iron = sum(ctx, "flat_iron");
      if (iron.kwh <= 0 || iron.uses < 2) return null;
      return {
        kwh: iron.kwh * ASSUMED.ironBatch,
        assumptions: [{ key: "ironBatch", label: "Savings from heating up once (assumption)", value: ASSUMED.ironBatch }],
      };
    },
  },
  {
    id: "washing-full-loads",
    title: "Wash only full loads",
    appliance: "washing_machine",
    basis: "assumption",
    kwhSaved: (ctx) => {
      const wash = sum(ctx, "washing_machine");
      if (wash.kwh <= 0 || wash.uses < 2) return null;
      const weeks = ctx.billingDays / 7;
      const perLoad = wash.kwh / (wash.uses * weeks);
      return {
        kwh: ASSUMED.washLoadsCutPerWeek * weeks * perLoad,
        assumptions: [{ key: "washLoadsCutPerWeek", label: "Loads cut per week (assumption)", value: ASSUMED.washLoadsCutPerWeek }],
      };
    },
  },
  {
    id: "ref-medium",
    title: "Set the ref to medium, not max",
    appliance: "refrigerator",
    basis: "assumption",
    kwhSaved: (ctx) => {
      const ref = sum(ctx, "refrigerator");
      if (ref.kwh <= 0) return null;
      return {
        kwh: ref.kwh * ASSUMED.refMedium,
        assumptions: [{ key: "refMedium", label: "Savings at the medium setting (assumption)", value: ASSUMED.refMedium }],
      };
    },
  },
];

export interface RankedMission {
  id: string;
  title: string;
  appliance: ApplianceType;
  basis: "physics" | "assumption";
  assumptions: Assumption[];
  kwhSaved: number;
  /** Centavos: kWh saved × the Rate Schedule's per-kWh charges. */
  pesoValue: number;
}

/** Applicable Missions with their computed value, highest peso value first. */
export function rankMissions(ctx: MissionContext, perKwhRate: number): RankedMission[] {
  return MISSION_CATALOG.flatMap((m) => {
    const saved = m.kwhSaved(ctx);
    if (!saved || saved.kwh <= 0) return [];
    return [
      {
        id: m.id,
        title: m.title,
        appliance: m.appliance,
        basis: m.basis,
        assumptions: saved.assumptions,
        kwhSaved: Math.round(saved.kwh * 100) / 100,
        pesoValue: Math.round(saved.kwh * perKwhRate * 100),
      },
    ];
  }).sort((a, b) => b.pesoValue - a.pesoValue || a.id.localeCompare(b.id));
}
