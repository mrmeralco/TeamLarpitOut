import { HOUR_MS, type ReadingMetadata, type ReadingRange } from "../domain/meter-reading.js";
import { DEMO_CLIMATE_DATES, DEMO_SMART_SIN, demoTemperatureC } from "../domain/demo-climate.js";
import type { UsagePlanRepository } from "../usage-plan/usage-plan-repository.interface.js";
import type { ReadingSource } from "./reading-source.interface.js";

// A fixed simulation window, including a simulated November, not live telemetry.
const SIMULATION: ReadingRange = {
  from: `${DEMO_CLIMATE_DATES.from}T00:00:00+08:00`,
  to: `${DEMO_CLIMATE_DATES.to}T00:00:00+08:00`,
};

/**
 * Deterministic demo adapter; calculates only the requested hours, with integer Wh.
 * Once the Household starts Missions, the simulated household follows them: the aircon
 * goes off at 5 AM instead of 6 AM, so daily Points have savings to verify (ADR-0008).
 */
export class MockReadingSource implements ReadingSource {
  constructor(private readonly plans?: Pick<UsagePlanRepository, "find">) {}

  async describe(sin: string): Promise<ReadingMetadata> {
    return {
      available: sin === DEMO_SMART_SIN ? { ...SIMULATION } : null,
      provenance: {
        kind: "synthetic",
        note: "Fixed Dec 2025–Nov 2026 simulation with invented temperatures and aircon usage; after Missions start, the simulated aircon goes off an hour earlier. Not real Meralco readings or observations.",
      },
    };
  }

  async readings(sin: string, range: ReadingRange) {
    if (sin !== DEMO_SMART_SIN) return [];
    const from = Math.max(Date.parse(range.from), Date.parse(SIMULATION.from));
    const to = Math.min(Date.parse(range.to), Date.parse(SIMULATION.to));
    const plan = this.plans ? await this.plans.find(sin) : null;
    const followsPlanFrom = plan ? Date.parse(plan.startedAt ?? plan.createdAt) : Infinity;
    const rows = [];
    // Derive the profile from the Household, never request order or random state.
    const profile = [...sin].reduce((sum, digit) => sum + Number(digit), 0);
    for (let timestamp = from; timestamp < to; timestamp += HOUR_MS) {
      const local = new Date(timestamp + 8 * HOUR_MS);
      const hour = local.getUTCHours();
      const temperatureC = demoTemperatureC(local.toISOString().slice(0, 10));
      const baseWh = 100 + profile;
      const eveningWh = hour >= 18 && hour < 22 ? 220 : 0;
      const airconOffHour = timestamp >= followsPlanFrom ? 5 : 6;
      const airconWh = hour >= 22 || hour < airconOffHour ? 600 + Math.max(0, temperatureC - 24) * 65 : 0;
      rows.push({ from: new Date(timestamp).toISOString(), wh: Math.round(baseWh + eveningWh + airconWh) });
    }
    return rows;
  }
}
