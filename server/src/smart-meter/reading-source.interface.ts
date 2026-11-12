import { HOUR_MS, type HourlyReading, type ReadingMetadata, type ReadingRange } from "../domain/meter-reading.js";

/** Replaceable hourly source. Ownership and Meter Type are checked before access. */
export interface ReadingSource {
  describe(sin: string): Promise<ReadingMetadata>;
  /** Only rows whose hour starts inside [from, to); order is not significant. */
  readings(sin: string, range: ReadingRange): Promise<HourlyReading[]>;
}

/** Isolated snapshots for HTTP tests, independent of the default synthetic model. */
export function inMemoryReadingSource(byHousehold: Record<string, HourlyReading[]> = {}): ReadingSource {
  const records = structuredClone(byHousehold);
  return {
    async describe(sin) {
      const times = (records[sin] ?? []).map((row) => Date.parse(row.from));
      return {
        available: times.length ? {
          from: new Date(Math.min(...times)).toISOString(),
          to: new Date(Math.max(...times) + HOUR_MS).toISOString(),
        } : null,
        provenance: { kind: "synthetic", note: "Synthetic test readings; not Meralco telemetry." },
      };
    },
    async readings(sin, range) {
      return structuredClone((records[sin] ?? []).filter((row) =>
        Date.parse(row.from) >= Date.parse(range.from) && Date.parse(row.from) < Date.parse(range.to)));
    },
  };
}
