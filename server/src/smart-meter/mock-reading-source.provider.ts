import { HOUR_MS, type ReadingMetadata, type ReadingRange } from "../domain/meter-reading.js";
import { DEMO_CLIMATE_DATES, DEMO_SMART_SIN, demoTemperatureC } from "../domain/demo-climate.js";
import type { ReadingSource } from "./reading-source.interface.js";

// A fixed simulation window, including a simulated November, not live telemetry.
const SIMULATION: ReadingRange = {
  from: `${DEMO_CLIMATE_DATES.from}T00:00:00+08:00`,
  to: `${DEMO_CLIMATE_DATES.to}T00:00:00+08:00`,
};

/** Deterministic demo adapter; calculates only the requested hours, with integer Wh. */
export class MockReadingSource implements ReadingSource {
  async describe(sin: string): Promise<ReadingMetadata> {
    return {
      available: sin === DEMO_SMART_SIN ? { ...SIMULATION } : null,
      provenance: {
        kind: "synthetic",
        note: "Fixed Dec 2025–Nov 2026 simulation with invented temperatures and aircon usage; not real Meralco readings or observations.",
      },
    };
  }

  async readings(sin: string, range: ReadingRange) {
    if (sin !== DEMO_SMART_SIN) return [];
    const from = Math.max(Date.parse(range.from), Date.parse(SIMULATION.from));
    const to = Math.min(Date.parse(range.to), Date.parse(SIMULATION.to));
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
      rows.push({ from: new Date(timestamp).toISOString(), wh: Math.round(baseWh + eveningWh + airconWh) });
    }
    return rows;
  }
}
