import { HOUR_MS, type ReadingMetadata, type ReadingRange } from "../domain/meter-reading.js";
import { DEMO_CLIMATE_DATES, DEMO_SMART_SIN, demoTemperatureC } from "../domain/demo-climate.js";
import type { UsagePlan, UsagePlanRepository } from "../usage-plan/usage-plan-repository.interface.js";
import type { ReadingSource } from "./reading-source.interface.js";

// A fixed simulation window, including a simulated November, not live telemetry.
const SIMULATION: ReadingRange = {
  from: `${DEMO_CLIMATE_DATES.from}T00:00:00+08:00`,
  to: `${DEMO_CLIMATE_DATES.to}T00:00:00+08:00`,
};

const ALL_DAY = Array.from({ length: 24 }, (_, hour) => hour);
const AIRCON_NIGHT = [22, 23, 0, 1, 2, 3, 4, 5];
const EVENING = [18, 19, 20, 21];

/**
 * The Asia/Manila hours in which following each Mission lowers use in the simulation, matching
 * the simulated aircon (10 PM–6 AM) and evening (6–10 PM). Missions not listed (ref, iron,
 * laundry) are spread over the whole day.
 */
export const MISSION_HOURS: Record<string, number[]> = {
  "aircon-off-1h": [5],
  "aircon-timer-2h": [4, 5],
  "fan-first-hour": [22],
  "aircon-25c": AIRCON_NIGHT,
  "unplug-standby": AIRCON_NIGHT,
  "lights-off": EVENING,
  "tv-hour-less": EVENING,
};

/** Days in a plan's "YYYY-MM" period: a Mission's kWh is for the whole period. */
const daysIn = (period: string) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Wh saved in each local hour of a day by a household that follows every Mission in the plan. */
export function missionSavingsByHour(plan: Pick<UsagePlan, "period" | "missions">): number[] {
  const saved = new Array<number>(24).fill(0);
  const days = daysIn(plan.period);
  for (const mission of plan.missions) {
    const hours = MISSION_HOURS[mission.id] ?? ALL_DAY;
    const perHour = (mission.kwhSaved * 1000) / days / hours.length;
    for (const hour of hours) saved[hour]! += perHour;
  }
  return saved;
}

/**
 * Wh the simulated household saves in the hour starting at `timestamp`: nothing before it started
 * Missions, then each Mission's share for that local hour. Only for sample readings, never real ones.
 */
export function planFollower(plan: Pick<UsagePlan, "period" | "missions" | "createdAt" | "startedAt"> | null): (timestamp: number) => number {
  if (!plan) return () => 0;
  const from = Date.parse(plan.startedAt ?? plan.createdAt);
  const saved = missionSavingsByHour(plan);
  return (timestamp) => (timestamp >= from ? saved[new Date(timestamp + 8 * HOUR_MS).getUTCHours()]! : 0);
}

/**
 * Deterministic demo adapter; calculates only the requested hours, with integer Wh.
 * Once the Household starts Missions, the simulated household follows its current plan: each
 * Mission lowers the readings by its own kWh per day, in the hours it applies to, so daily
 * Points verify about what the plan promised (ADR-0008). The base household (an aircon at
 * night, evening use) stays the same whatever appliances were entered.
 */
export class MockReadingSource implements ReadingSource {
  constructor(private readonly plans?: Pick<UsagePlanRepository, "find">) {}

  async describe(sin: string): Promise<ReadingMetadata> {
    return {
      available: sin === DEMO_SMART_SIN ? { ...SIMULATION } : null,
      provenance: {
        kind: "synthetic",
        note: "Fixed Dec 2025–Nov 2026 simulation with invented temperatures and aircon usage; after Missions start, the simulated household follows its plan. Not real Meralco readings or observations.",
      },
    };
  }

  async readings(sin: string, range: ReadingRange) {
    if (sin !== DEMO_SMART_SIN) return [];
    const from = Math.max(Date.parse(range.from), Date.parse(SIMULATION.from));
    const to = Math.min(Date.parse(range.to), Date.parse(SIMULATION.to));
    const savedWh = planFollower(this.plans ? await this.plans.find(sin) : null);
    const rows = [];
    // Derive the profile from the Household, never request order or random state.
    const profile = [...sin].reduce((sum, digit) => sum + Number(digit), 0);
    for (let timestamp = from; timestamp < to; timestamp += HOUR_MS) {
      const local = new Date(timestamp + 8 * HOUR_MS);
      const hour = local.getUTCHours();
      const temperatureC = demoTemperatureC(local.toISOString().slice(0, 10));
      const baseWh = 100 + profile;
      const eveningWh = hour >= 18 && hour < 22 ? 220 : 0;
      const airconWh = hour >= 22 || hour < 6 ? 600 + Math.max(0, temperatureC - 24) * 65 : 0;
      rows.push({ from: new Date(timestamp).toISOString(), wh: Math.max(0, Math.round(baseWh + eveningWh + airconWh - savedWh(timestamp))) });
    }
    return rows;
  }
}
