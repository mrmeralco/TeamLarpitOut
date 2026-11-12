import type { HouseholdLink, HouseholdLinkRepository } from "../households/household-link.repository.js";
import type { Sql } from "./database.module.js";
import { TtlCache } from "./ttl-cache.js";

type Row = { owner_id: string; sin: string; can: string; status: HouseholdLink["status"] };
const toLink = (r: Row): HouseholdLink => ({ ownerId: r.owner_id, sin: r.sin, can: r.can, status: r.status });

/** Which login holds which Household, in `public.household_links` (any number of logins per SIN, ADR-0005). */
export class PgHouseholdLinkRepository implements HouseholdLinkRepository {
  private readonly byOwner = new TtlCache<HouseholdLink[]>(30_000);

  constructor(private readonly sql: Sql) {}

  forOwner(ownerId: string) {
    return this.byOwner.get(ownerId, () => this.loadForOwner(ownerId));
  }

  private async loadForOwner(ownerId: string) {
    const rows = await this.sql<Row[]>`
      select owner_id, sin, can, status from public.household_links where owner_id = ${ownerId} order by linked_at`;
    return rows.map(toLink);
  }

  async save(link: HouseholdLink) {
    await this.sql`
      insert into public.household_links (owner_id, sin, can, status)
      values (${link.ownerId}, ${link.sin}, ${link.can}, ${link.status})
      on conflict (owner_id, sin) do update set can = excluded.can, status = excluded.status`;
    this.byOwner.delete(link.ownerId);
  }

  async remove(ownerId: string, sin: string) {
    await this.sql`delete from public.household_links where owner_id = ${ownerId} and sin = ${sin}`;
    this.byOwner.delete(ownerId);
  }
}
