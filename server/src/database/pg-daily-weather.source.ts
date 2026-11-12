import { DAY_MS, METER_TIME_ZONE } from "../domain/meter-reading.js";
import type { DailyWeather, DailyWeatherRange, DailyWeatherSource } from "../weather/daily-weather-source.interface.js";
import type { Sql } from "./database.module.js";

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Daily temperature in `public.weather_daily`, looked up by the area on the Household's Meralco account. */
export class PgDailyWeatherSource implements DailyWeatherSource {
  constructor(private readonly sql: Sql) {}

  async daily(sin: string, range: DailyWeatherRange): Promise<DailyWeather> {
    if (!isDate(range.from) || !isDate(range.to) || range.from >= range.to) {
      throw new RangeError("Daily weather range must be valid dates with from before to");
    }
    const requestedDays = (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / DAY_MS;
    const [account] = await this.sql<{ area: string }[]>`select area from meralco.accounts where sin = ${sin}`;
    const empty = { timeZone: METER_TIME_ZONE, range, available: null, coverage: { requestedDays, returnedDays: 0 } } as const;
    if (!account) return { ...empty, provenance: { kind: "synthetic", note: "No weather for this Household's area." }, days: [] };

    const [bounds] = await this.sql<{ first: string | null; last: string | null; sample: boolean | null }[]>`
      select to_char(min(date), 'YYYY-MM-DD') as first, to_char(max(date) + 1, 'YYYY-MM-DD') as last,
             bool_or(provenance = 'sample') as sample
      from public.weather_daily where area = ${account.area}`;
    const rows = await this.sql<{ date: string; temperature_c: number }[]>`
      select to_char(date, 'YYYY-MM-DD') as date, temperature_c from public.weather_daily
      where area = ${account.area} and date >= ${range.from} and date < ${range.to} order by date`;
    const sample = bounds?.sample !== false;
    return {
      ...empty,
      available: bounds?.first && bounds.last ? { from: bounds.first, to: bounds.last } : null,
      coverage: { requestedDays, returnedDays: rows.length },
      provenance: sample
        ? { kind: "synthetic", note: `Sample temperatures for ${account.area}, shared with the simulated smart meter readings; not weather observations.` }
        : { kind: "observed", note: `Observed daily temperatures for ${account.area}.` },
      days: rows.map((r) => ({ date: r.date, temperatureC: Number(r.temperature_c) })),
    };
  }
}
