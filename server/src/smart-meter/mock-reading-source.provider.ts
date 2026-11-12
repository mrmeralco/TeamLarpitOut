import { HOUR_MS, type ReadingMetadata, type ReadingRange } from "../domain/meter-reading.js";
import type { ReadingSource } from "./reading-source.interface.js";

// A fixed simulation window, including a simulated November, not live telemetry.
const SIMULATION: ReadingRange = { from: "2025-12-01T00:00:00+08:00", to: "2026-12-01T00:00:00+08:00" };
const MONTH_TEMPERATURES = [27, 28, 30, 32, 33, 31, 30, 30, 30, 29, 28, 27];
const DEMO_SMART_SIN = "9876543210";

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
      const temperatureC = MONTH_TEMPERATURES[local.getUTCMonth()]!
        + Math.sin(local.getUTCDate() * Math.PI / 7);
      const baseWh = 100 + profile;
      const eveningWh = hour >= 18 && hour < 22 ? 220 : 0;
      const airconWh = hour >= 22 || hour < 6 ? 600 + Math.max(0, temperatureC - 24) * 65 : 0;
      rows.push({ from: new Date(timestamp).toISOString(), wh: Math.round(baseWh + eveningWh + airconWh) });
    }
    return rows;
  }
}
