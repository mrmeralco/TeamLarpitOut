import type { AirconPattern, HomePattern, SetupRecord, SetupRepository } from "../setup/setup-repository.js";
import type { Sql } from "./database.module.js";
import { TtlCache } from "./ttl-cache.js";

interface SetupRow {
  size: number | null;
  home_pattern: string | null;
  aircon_pattern: string | null;
  grid: SetupRecord["grid"] | null;
  grid_written_at: Date | null;
  /** Written by older clients: the aircon's photo estimate only. */
  aircon_photo: { answers: Record<string, string>; kwhPerHour: number } | null;
  appliance_photos: SetupRecord["photos"] | null;
  completed_at: Date | null;
  onboarding_seen_at: Date | null;
}

/** Household Setup progress in `public.household_setup`, one row per Household. */
export class PgSetupRepository implements SetupRepository {
  private readonly cache = new TtlCache<SetupRecord>(60_000);

  constructor(private readonly sql: Sql) {}

  find(sin: string): Promise<SetupRecord> {
    return this.cache.get(sin, () => this.load(sin));
  }

  private async load(sin: string): Promise<SetupRecord> {
    const [row] = await this.sql<SetupRow[]>`
      select size, home_pattern, aircon_pattern, grid, grid_written_at, aircon_photo, appliance_photos, completed_at, onboarding_seen_at
      from public.household_setup where sin = ${sin}`;
    if (!row) return {};
    const record: SetupRecord = {};
    if (row.size !== null) record.household = { size: row.size };
    if (row.home_pattern !== null) {
      record.routine = { home: row.home_pattern as HomePattern, aircon: (row.aircon_pattern as AirconPattern | null) ?? null };
    }
    if (row.grid !== null) record.grid = row.grid;
    if (row.grid_written_at !== null) record.gridWrittenAt = new Date(row.grid_written_at).toISOString();
    if (row.appliance_photos !== null) record.photos = row.appliance_photos;
    else if (row.aircon_photo !== null) record.photos = { aircon: { answers: row.aircon_photo.answers, kwh: row.aircon_photo.kwhPerHour } };
    if (row.completed_at !== null) record.completedAt = new Date(row.completed_at).toISOString();
    if (row.onboarding_seen_at !== null) record.onboardingSeenAt = new Date(row.onboarding_seen_at).toISOString();
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
      appliance_photos: record.photos ? this.sql.json(record.photos as never) : null,
      // Kept in step for older clients that read only the aircon's estimate.
      aircon_photo: record.photos?.aircon
        ? this.sql.json({ answers: record.photos.aircon.answers, kwhPerHour: record.photos.aircon.kwh } as never)
        : null,
      completed_at: record.completedAt ? new Date(record.completedAt) : null,
      onboarding_seen_at: record.onboardingSeenAt ? new Date(record.onboardingSeenAt) : null,
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
        appliance_photos = excluded.appliance_photos,
        completed_at = excluded.completed_at,
        onboarding_seen_at = excluded.onboarding_seen_at`;
    this.cache.set(sin, record);
  }
}
