/**
 * Where outage records come from (Meralco records).
 * Used to exclude brownouts from Verified Savings and Points (§2.6).
 */
export interface OutageRecord {
  sin: string;
  period: string; // "YYYY-MM"
  /** The day of the outage (YYYY-MM-DD) when Meralco's record has one. */
  date?: string;
  durationHours?: number;
  description?: string;
}

export interface OutageSource {
  hasOutage(sin: string, period: string): Promise<boolean>;
  /** For smart meter days: a record for that date, or a record for its month with no date (the day is then unknown). */
  hasOutageOn(sin: string, date: string): Promise<boolean>;
  outages(sin: string): Promise<OutageRecord[]>;
}

export function inMemoryOutageSource(records: OutageRecord[] = []): OutageSource {
  const list = [...records];
  return {
    async hasOutage(sin: string, period: string) {
      return list.some((r) => r.sin === sin && r.period === period);
    },
    async hasOutageOn(sin: string, date: string) {
      return list.some((r) => r.sin === sin && (r.date ? r.date === date : r.period === date.slice(0, 7)));
    },
    async outages(sin: string) {
      return list.filter((r) => r.sin === sin);
    },
  };
}
