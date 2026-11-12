import type { AirconPattern, HomePattern, SetupRecord, SetupRepository } from "../setup/setup-repository.js";
import type { Sql } from "./database.module.js";

interface SetupRow {
  size: number | null;
  home_pattern: string | null;
  aircon_pattern: string | null;
  grid: SetupRecord["grid"] | null;
  grid_written_at: Date | null;
  aircon_photo: SetupRecord["airconPhoto"] | null;
  completed_at: Date | null;
}

/** Household Setup progress in `public.household_setup`, one row per Household. */
export class PgSetupRepository implements SetupRepository {
  constructor(private readonly sql: Sql) {}

  async find(sin: string): Promise<SetupRecord> {
    const [row] = await this.sql<SetupRow[]>`
      select size, home_pattern, aircon_pattern, grid, grid_written_at, aircon_photo, completed_at
      from public.household_setup where sin = ${sin}`;
    if (!row) return {};
    const record: SetupRecord = {};
    if (row.size !== null) record.household = { size: row.size };
    if (row.home_pattern !== null) {
      record.routine = { home: row.home_pattern as HomePattern, aircon: (row.aircon_pattern as AirconPattern | null) ?? null };
    }
    if (row.grid !== null) record.grid = row.grid;
    if (row.grid_written_at !== null) record.gridWrittenAt = new Date(row.grid_written_at).toISOString();
    if (row.aircon_photo !== null) record.airconPhoto = row.aircon_photo;
    if (row.completed_at !== null) record.completedAt = new Date(row.completed_at).toISOString();
    return record;
  }

  async save(sin: string, record: SetupRecord): Promise<void> {
    const row = {
      sin,
      size: record.household?.size ?? null,
      home_pattern: record.routine?.home ?? null,
      aircon_pattern: record.routine?.aircon ?? null,
      grid: record.grid ? this.sql.json(record.grid as never) : null,
      grid_written_at: record.gridWrittenAt ? new Date(record.gridWrittenAt) : null,
      aircon_photo: record.airconPhoto ? this.sql.json(record.airconPhoto as never) : null,
      completed_at: record.completedAt ? new Date(record.completedAt) : null,
    };
    await this.sql`
      insert into public.household_setup ${this.sql(row)}
      on conflict (sin) do update set
        size = excluded.size,
        home_pattern = excluded.home_pattern,
        aircon_pattern = excluded.aircon_pattern,
        grid = excluded.grid,
        grid_written_at = excluded.grid_written_at,
        aircon_photo = excluded.aircon_photo,
        completed_at = excluded.completed_at`;
  }
}
