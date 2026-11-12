import type { MidMonthReading, MidMonthReadingRepository } from "../usage-plan/mid-month-reading-repository.interface.js";
import type { Sql } from "./database.module.js";

interface ReadingRow {
  period: string;
  reading: string;
  kwh_so_far: string;
  elapsed_days: number;
  remaining_days: number;
  reading_date: string | null;
  created_at: Date;
}

/**
 * Typed Mid-month Readings in `public.mid_month_readings`, one per Household per period.
 * `find` returns the latest; `delete` clears every period, matching the in-memory version.
 */
export class PgMidMonthReadingRepository implements MidMonthReadingRepository {
  constructor(private readonly sql: Sql) {}

  async find(sin: string): Promise<MidMonthReading | null> {
    const [row] = await this.sql<ReadingRow[]>`
      select period, reading, kwh_so_far, elapsed_days, remaining_days, to_char(reading_date, 'YYYY-MM-DD') as reading_date, created_at
      from public.mid_month_readings where sin = ${sin} order by period desc, created_at desc limit 1`;
    if (!row) return null;
    return {
      sin,
      period: row.period,
      reading: Number(row.reading),
      kwhSoFar: Number(row.kwh_so_far),
      elapsedDays: row.elapsed_days,
      remainingDays: row.remaining_days,
      readingDate: row.reading_date,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async save(sin: string, reading: MidMonthReading): Promise<MidMonthReading> {
    const row = {
      sin,
      period: reading.period,
      reading: reading.reading,
      kwh_so_far: reading.kwhSoFar,
      elapsed_days: reading.elapsedDays,
      remaining_days: reading.remainingDays,
      reading_date: reading.readingDate ?? null,
      created_at: new Date(reading.createdAt),
    };
    await this.sql`
      insert into public.mid_month_readings ${this.sql(row)}
      on conflict (sin, period) do update set
        reading = excluded.reading,
        kwh_so_far = excluded.kwh_so_far,
        elapsed_days = excluded.elapsed_days,
        remaining_days = excluded.remaining_days,
        reading_date = excluded.reading_date,
        created_at = excluded.created_at`;
    return structuredClone(reading);
  }

  async delete(sin: string): Promise<void> {
    await this.sql`delete from public.mid_month_readings where sin = ${sin}`;
  }
}
