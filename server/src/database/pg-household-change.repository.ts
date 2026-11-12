import type { HouseholdChange } from "../domain/household.js";
import type { HouseholdChangeRepository } from "../households/household-change.repository.js";
import type { Sql } from "./database.module.js";
import { TtlCache } from "./ttl-cache.js";

/** Household changes in `public.household_changes`, so they survive restarts. */
export class PgHouseholdChangeRepository implements HouseholdChangeRepository {
  private readonly cache = new TtlCache<HouseholdChange[]>(60_000);

  constructor(private readonly sql: Sql) {}

  forHousehold(sin: string): Promise<HouseholdChange[]> {
    return this.cache.get(sin, () => this.load(sin));
  }

  private async load(sin: string): Promise<HouseholdChange[]> {
    const rows = await this.sql<{ reason: string; period: string | null; recorded_at: Date }[]>`
      select reason, period, recorded_at from public.household_changes where sin = ${sin} order by recorded_at, id`;
    return rows.map((r) => ({ reason: r.reason, ...(r.period ? { period: r.period } : {}), recordedAt: new Date(r.recorded_at).toISOString() }));
  }

  async add(sin: string, change: HouseholdChange) {
    await this.sql`
      insert into public.household_changes (sin, reason, period, recorded_at)
      values (${sin}, ${change.reason}, ${change.period ?? null}, ${change.recordedAt ?? new Date().toISOString()})`;
    this.cache.delete(sin);
  }
}
