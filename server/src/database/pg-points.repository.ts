import type { PointsEntry, PointsRepository } from "../usage-plan/points-repository.interface.js";
import type { Sql } from "./database.module.js";

interface PointsRow {
  id: string;
  sin: string;
  period: string | null;
  day: string | null;
  points: number;
  source: PointsEntry["source"];
  saved_centavos: string;
  saved_kwh: string;
  baseline_kwh: string;
  actual_kwh: string;
  has_outage: boolean;
  excluded_reason: string | null;
  description: string;
  reward_id: string | null;
  reward_name: string | null;
  created_at: Date;
}

/** The Points ledger in `public.points_entries`; rows are only added and the balance is their sum. */
export class PgPointsRepository implements PointsRepository {
  constructor(private readonly sql: Sql) {}

  async getEntries(sin: string): Promise<PointsEntry[]> {
    const rows = await this.sql<PointsRow[]>`
      select id, sin, period, to_char(day, 'YYYY-MM-DD') as day, points, source, saved_centavos, saved_kwh, baseline_kwh, actual_kwh,
             has_outage, excluded_reason, description, reward_id, reward_name, created_at
      from public.points_entries where sin = ${sin} order by created_at, id`;
    return rows.map((row) => {
      const entry: PointsEntry = {
        id: row.id,
        sin: row.sin,
        period: row.period ?? "",
        points: row.points,
        savedPesos: Number(row.saved_centavos),
        savedKwh: Number(row.saved_kwh),
        baselineKwh: Number(row.baseline_kwh),
        actualKwh: Number(row.actual_kwh),
        source: row.source,
        hasOutage: row.has_outage,
        excludedReason: row.excluded_reason,
        description: row.description,
        createdAt: new Date(row.created_at).toISOString(),
      };
      if (row.day !== null) entry.day = row.day;
      if (row.reward_id !== null) entry.rewardId = row.reward_id;
      if (row.reward_name !== null) entry.rewardName = row.reward_name;
      return entry;
    });
  }

  async addEntry(sin: string, entry: PointsEntry): Promise<void> {
    const row = {
      id: entry.id,
      sin,
      // Welcome Points have no period; `period` is char(7), so "" is stored as null.
      period: entry.period || null,
      // Smart meter daily entries only (ADR-0008).
      day: entry.day ?? null,
      points: entry.points,
      source: entry.source,
      saved_centavos: Math.round(entry.savedPesos),
      saved_kwh: entry.savedKwh,
      baseline_kwh: entry.baselineKwh,
      actual_kwh: entry.actualKwh,
      has_outage: entry.hasOutage,
      excluded_reason: entry.excludedReason ?? null,
      description: entry.description,
      reward_id: entry.rewardId ?? null,
      reward_name: entry.rewardName ?? null,
      created_at: new Date(entry.createdAt),
    };
    // A repeated id (e.g. Welcome Points granted twice in a race) is ignored: the ledger only grows once per entry.
    await this.sql`insert into public.points_entries ${this.sql(row)} on conflict do nothing`;
  }

  async getBalance(sin: string): Promise<number> {
    const [row] = await this.sql<{ balance: number }[]>`
      select coalesce(sum(points), 0)::int as balance from public.points_entries where sin = ${sin}`;
    return row?.balance ?? 0;
  }
}
