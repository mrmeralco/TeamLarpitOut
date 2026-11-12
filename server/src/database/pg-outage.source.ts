import type { OutageRecord, OutageSource } from "../bills/outage-source.js";
import type { Sql } from "./database.module.js";

interface OutageRow { sin: string; period: string; outage_date: string | null; duration_hours: string | null; description: string | null }

/** Outages on Meralco's record in `meralco.outages`, by Household. */
export class PgOutageSource implements OutageSource {
  constructor(private readonly sql: Sql) {}

  async hasOutage(sin: string, period: string) {
    const [row] = await this.sql`select 1 from meralco.outages where sin = ${sin} and period = ${period} limit 1`;
    return Boolean(row);
  }

  /** A record for that date, or one for its month with no date (the day is then unknown). */
  async hasOutageOn(sin: string, date: string) {
    const [row] = await this.sql`
      select 1 from meralco.outages
      where sin = ${sin} and (outage_date = ${date} or (outage_date is null and period = ${date.slice(0, 7)})) limit 1`;
    return Boolean(row);
  }

  async outages(sin: string): Promise<OutageRecord[]> {
    const rows = await this.sql<OutageRow[]>`
      select sin, period, to_char(outage_date, 'YYYY-MM-DD') as outage_date, duration_hours, description
      from meralco.outages where sin = ${sin} order by period, outage_date`;
    return rows.map((r) => ({
      sin: r.sin,
      period: r.period,
      ...(r.outage_date ? { date: r.outage_date } : {}),
      ...(r.duration_hours !== null ? { durationHours: Number(r.duration_hours) } : {}),
      ...(r.description ? { description: r.description } : {}),
    }));
  }
}
