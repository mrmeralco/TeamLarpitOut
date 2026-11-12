export type HomePattern = "allDay" | "eveningsWeekends" | "daytime";
export type AirconPattern = "sleeping" | "afternoonNight" | "mostOfDay";

/** Household Setup progress for one Household (ADR-0004, ADR-0006). Only what the computations use. */
export interface SetupRecord {
  household?: { size: number };
  routine?: { home: HomePattern; aircon: AirconPattern | null };
  completedAt?: string;
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
