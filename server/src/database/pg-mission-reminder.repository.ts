import type { MissionReminderRepository } from "../usage-plan/mission-reminder.repository.js";
import type { Sql } from "./database.module.js";
import { TtlCache } from "./ttl-cache.js";

/** Mission reminders in `public.mission_reminders`. */
export class PgMissionReminderRepository implements MissionReminderRepository {
  private readonly cache = new TtlCache<string[]>(60_000);

  constructor(private readonly sql: Sql) {}

  forPeriod(sin: string, period: string) {
    return this.cache.get(`${sin}:${period}`, () => this.load(sin, period));
  }

  private async load(sin: string, period: string) {
    const rows = await this.sql<{ mission_id: string }[]>`
      select mission_id from public.mission_reminders where sin = ${sin} and period = ${period} order by created_at`;
    return rows.map((r) => r.mission_id);
  }

  async add(sin: string, period: string, missionId: string) {
    await this.sql`
      insert into public.mission_reminders (sin, period, mission_id) values (${sin}, ${period}, ${missionId})
      on conflict do nothing`;
    this.cache.delete(`${sin}:${period}`);
  }
}
