import { HOUR_MS, type HourlyReading, type ReadingMetadata, type ReadingRange } from "../domain/meter-reading.js";
import { planFollower } from "../smart-meter/mock-reading-source.provider.js";
import type { ReadingSource } from "../smart-meter/reading-source.interface.js";
import type { UsagePlanRepository } from "../usage-plan/usage-plan-repository.interface.js";
import type { Sql } from "./database.module.js";

interface ReadingRow { hour_start: Date; wh: number; provenance: "real" | "sample" }

/**
 * Smart meter readings in `meralco.meter_readings`. Sample rows are the demo household: once it
 * starts Missions it follows its plan, as the mock does (ADR-0008). Real rows are returned as stored.
 */
export class PgReadingSource implements ReadingSource {
  constructor(private readonly sql: Sql, private readonly plans?: Pick<UsagePlanRepository, "find">) {}

  async describe(sin: string): Promise<ReadingMetadata> {
    const [row] = await this.sql<{ first: Date | null; last: Date | null; sample: boolean | null }[]>`
      select min(hour_start) as first, max(hour_start) as last, bool_or(provenance = 'sample') as sample
      from meralco.meter_readings where sin = ${sin}`;
    const available = row?.first && row.last
      ? { from: new Date(row.first).toISOString(), to: new Date(new Date(row.last).getTime() + HOUR_MS).toISOString() }
      : null;
    return {
      available,
      provenance: {
        kind: "synthetic",
        note: row?.sample === false
          ? "Smart meter readings on Meralco's record."
          : "Sample readings stored for the demo (simulated temperatures and aircon use); after Missions start, the simulated household follows its plan. Not real Meralco readings.",
      },
    };
  }

  async readings(sin: string, range: ReadingRange): Promise<HourlyReading[]> {
    const rows = await this.sql<ReadingRow[]>`
      select hour_start, wh, provenance from meralco.meter_readings
      where sin = ${sin} and hour_start >= ${new Date(range.from)} and hour_start < ${new Date(range.to)}
      order by hour_start`;
    const savedWh = rows.some((r) => r.provenance === "sample") && this.plans ? planFollower(await this.plans.find(sin)) : () => 0;
    return rows.map((r) => {
      const timestamp = new Date(r.hour_start).getTime();
      const wh = r.provenance === "sample" ? Math.max(0, Math.round(r.wh - savedWh(timestamp))) : r.wh;
      return { from: new Date(timestamp).toISOString(), wh };
    });
  }
}
