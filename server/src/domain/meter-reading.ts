export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const METER_TIME_ZONE = "Asia/Manila";
const MANILA_OFFSET_MS = 8 * HOUR_MS;

export type ReadingInterval = "hour" | "day" | "week";
/** Half-open range [from, to), expressed as ISO timestamps. */
export interface ReadingRange { from: string; to: string }
/** Consumption during the hour starting at `from`, not a cumulative meter value. */
export interface HourlyReading { from: string; wh: number }
export interface UsageBucket extends ReadingRange { kwh: number; partial: boolean }
export interface ReadingMetadata {
  available: ReadingRange | null;
  provenance: { kind: "synthetic"; note: string };
}
export interface UsageReadings extends ReadingMetadata {
  sin: string;
  interval: ReadingInterval;
  timeZone: typeof METER_TIME_ZONE;
  range: ReadingRange | null;
  readings: UsageBucket[];
}

export function isHourAligned(value: number): boolean {
  return Number.isFinite(value) && value % HOUR_MS === 0;
}

function bucketStart(timestamp: number, interval: ReadingInterval): number {
  if (interval === "hour") return timestamp;
  const day = Math.floor((timestamp + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS - MANILA_OFFSET_MS;
  if (interval === "day") return day;
  const weekday = new Date(day + MANILA_OFFSET_MS).getUTCDay();
  return day - ((weekday + 6) % 7) * DAY_MS;
}

/** Missing hours stay missing; partial buckets must never imply complete coverage. */
export function aggregateReadings(rows: HourlyReading[], range: ReadingRange, interval: ReadingInterval): UsageBucket[] {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const width = interval === "hour" ? HOUR_MS : interval === "day" ? DAY_MS : 7 * DAY_MS;
  const seen = new Set<number>();
  const buckets = new Map<number, { wh: number; count: number }>();
  for (const row of rows) {
    const timestamp = Date.parse(row.from);
    if (!isHourAligned(timestamp) || timestamp < from || timestamp >= to || seen.has(timestamp)
      || !Number.isSafeInteger(row.wh) || row.wh < 0) {
      throw new Error("Invalid hourly reading source data");
    }
    seen.add(timestamp);
    const start = bucketStart(timestamp, interval);
    const bucket = buckets.get(start) ?? { wh: 0, count: 0 };
    bucket.wh += row.wh;
    if (!Number.isSafeInteger(bucket.wh)) throw new Error("Reading total exceeds safe precision");
    bucket.count++;
    buckets.set(start, bucket);
  }
  return [...buckets].sort(([a], [b]) => a - b).map(([start, bucket]) => ({
    from: new Date(Math.max(start, from)).toISOString(),
    to: new Date(Math.min(start + width, to)).toISOString(),
    kwh: bucket.wh / 1000,
    partial: bucket.count !== width / HOUR_MS,
  }));
}
