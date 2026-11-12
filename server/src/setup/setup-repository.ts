import type { AirconPattern, GridType, HomePattern, PhotoEstimate } from "../domain/routine-presets.js";
export type { AirconPattern, HomePattern };

/** Household Setup progress for one Household (ADR-0004, ADR-0006). Only what the computations use. */
export interface SetupRecord {
  household?: { size: number };
  routine?: { home: HomePattern; aircon: AirconPattern | null };
  /** The tap grid: how many of each appliance. Present when appliances came from setup, not the detailed editor. */
  grid?: Partial<Record<GridType, number>>;
  /** updatedAt of the appliance list the grid last wrote; a later detailed edit is never overwritten. */
  gridWrittenAt?: string;
  /** Visual answers estimated from photos, per tap-grid appliance, with the rating they select. */
  photos?: Partial<Record<GridType, PhotoEstimate>>;
  completedAt?: string;
  /** When Eelio's Missions onboarding was shown and closed. */
  onboardingSeenAt?: string;
}

export interface SetupRepository {
  find(sin: string): Promise<SetupRecord>;
  save(sin: string, record: SetupRecord): Promise<void>;
}

export class InMemorySetupRepository implements SetupRepository {
  private readonly records = new Map<string, SetupRecord>();
  async find(sin: string) { return structuredClone(this.records.get(sin) ?? {}); }
  async save(sin: string, record: SetupRecord) { this.records.set(sin, structuredClone(record)); }
}
