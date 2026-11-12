import { DAY_MS, METER_TIME_ZONE } from "../domain/meter-reading.js";

/** Half-open [from, to) range of Asia/Manila calendar dates, both YYYY-MM-DD. */
export interface DailyWeatherRange { from: string; to: string }
export interface DailyTemperature { date: string; temperatureC: number }
export interface DailyWeatherProvenance { kind: "synthetic" | "observed"; note: string }
export interface DailyWeather {
  timeZone: typeof METER_TIME_ZONE;
  range: DailyWeatherRange;
  /** Source bounds; gaps inside these bounds may still exist. */
  available: DailyWeatherRange | null;
  coverage: { requestedDays: number; returnedDays: number };
  provenance: DailyWeatherProvenance;
  /** Sorted by local date. Missing days remain absent, never invented as zero heat. */
  days: DailyTemperature[];
}

/** Household ownership and Meter Type must be checked by the caller before access. */
export interface DailyWeatherSource {
  daily(sin: string, range: DailyWeatherRange): Promise<DailyWeather>;
}

function dateTimestamp(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new RangeError("Expected a valid YYYY-MM-DD calendar date");
  }
  return timestamp;
}

/** Isolated per-Household snapshots; also used to serve the fixed demo climate. */
export function inMemoryDailyWeatherSource(
  byHousehold: Record<string, DailyTemperature[]> = {},
  provenance: DailyWeatherProvenance = { kind: "synthetic", note: "Synthetic test temperatures; not weather observations." },
): DailyWeatherSource {
  const records = structuredClone(byHousehold);
  const sourceProvenance = { ...provenance };
  for (const days of Object.values(records)) {
    const seen = new Set<string>();
    for (const day of days) {
      dateTimestamp(day.date);
      if (!Number.isFinite(day.temperatureC) || seen.has(day.date)) {
        throw new Error("Invalid daily weather source data");
      }
      seen.add(day.date);
    }
    days.sort((a, b) => a.date.localeCompare(b.date));
  }
  return {
    async daily(sin, range) {
      const from = dateTimestamp(range.from);
      const to = dateTimestamp(range.to);
      if (from >= to) throw new RangeError("Daily weather range must have from before to");
      const all = Object.hasOwn(records, sin) ? records[sin]! : [];
      const days = all.filter((day) => day.date >= range.from && day.date < range.to);
      return structuredClone({
        timeZone: METER_TIME_ZONE,
        range,
        available: all.length ? {
          from: all[0]!.date,
          to: new Date(dateTimestamp(all.at(-1)!.date) + DAY_MS).toISOString().slice(0, 10),
        } : null,
        coverage: { requestedDays: (to - from) / DAY_MS, returnedDays: days.length },
        provenance: sourceProvenance,
        days,
      });
    },
  };
}
