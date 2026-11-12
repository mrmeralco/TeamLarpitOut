import type { OutageRecord, OutageSource } from "../bills/outage-source.js";
import type { Sql } from "./database.module.js";
import { TtlCache } from "./ttl-cache.js";

interface OutageRow { sin: string; period: string; outage_date: string | null; duration_hours: string | null; description: string | null }

/** Outages on Meralco's record in `meralco.outages`, by Household. */
export class PgOutageSource implements OutageSource {
  /** One read per Household serves every check (daily Points ask once per day). Meralco's record changes rarely. */
  private readonly cache = new TtlCache<OutageRecord[]>(5 * 60_000);

  constructor(private readonly sql: Sql) {}

  async hasOutage(sin: string, period: string) {
    return (await this.outages(sin)).some((o) => o.period === period);
  }

  /** A record for that date, or one for its month with no date (the day is then unknown). */
  async hasOutageOn(sin: string, date: string) {
    return (await this.outages(sin)).some((o) => o.date === date || (!o.date && o.period === date.slice(0, 7)));
  }

  outages(sin: string): Promise<OutageRecord[]> {
    return this.cache.get(sin, () => this.load(sin));
  }

  private async load(sin: string): Promise<OutageRecord[]> {
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
