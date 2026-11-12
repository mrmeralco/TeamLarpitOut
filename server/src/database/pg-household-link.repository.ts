import type { HouseholdLink, HouseholdLinkRepository } from "../households/household-link.repository.js";
import type { Sql } from "./database.module.js";

type Row = { owner_id: string; sin: string; can: string; status: HouseholdLink["status"] };
const toLink = (r: Row): HouseholdLink => ({ ownerId: r.owner_id, sin: r.sin, can: r.can, status: r.status });

/** Which login holds which Household, in `public.household_links` (one active owner per SIN, ADR-0005). */
export class PgHouseholdLinkRepository implements HouseholdLinkRepository {
  constructor(private readonly sql: Sql) {}

  async forOwner(ownerId: string) {
    const rows = await this.sql<Row[]>`
      select owner_id, sin, can, status from public.household_links where owner_id = ${ownerId} order by linked_at`;
    return rows.map(toLink);
  }

  async activeOwner(sin: string) {
    const [row] = await this.sql<{ owner_id: string }[]>`
      select owner_id from public.household_links where sin = ${sin} and status = 'active' limit 1`;
    return row?.owner_id ?? null;
  }

  async save(link: HouseholdLink) {
    await this.sql`
      insert into public.household_links (owner_id, sin, can, status)
      values (${link.ownerId}, ${link.sin}, ${link.can}, ${link.status})
      on conflict (owner_id, sin) do update set can = excluded.can, status = excluded.status`;
  }

  async remove(ownerId: string, sin: string) {
    await this.sql`delete from public.household_links where owner_id = ${ownerId} and sin = ${sin}`;
  }
}
