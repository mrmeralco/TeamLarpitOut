/**
 * Where outage records come from (Meralco records).
 * Used to exclude brownouts from Verified Savings and Points (§2.6).
 */
export interface OutageRecord {
  sin: string;
  period: string; // "YYYY-MM"
  durationHours?: number;
  description?: string;
}

export interface OutageSource {
  hasOutage(sin: string, period: string): Promise<boolean>;
  outages(sin: string): Promise<OutageRecord[]>;
}

export function inMemoryOutageSource(records: OutageRecord[] = []): OutageSource {
  const list = [...records];
  return {
    async hasOutage(sin: string, period: string) {
      return list.some((r) => r.sin === sin && r.period === period);
    },
    async outages(sin: string) {
      return list.filter((r) => r.sin === sin);
    },
  };
}
