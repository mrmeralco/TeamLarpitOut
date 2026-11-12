import type { ApplianceRepository, StoredAppliances } from "../appliances/appliance-repository.interface.js";
import type { ApplianceInput } from "../domain/appliance-usage.js";
import type { Sql } from "./database.module.js";

interface ApplianceRow {
  type: string;
  quantity: number;
  answers: ApplianceInput["answers"] | null;
  time_ranges: ApplianceInput["timeRanges"] | null;
  uses_per_week: string | null;
  energy_label: ApplianceInput["energyLabel"] | null;
  updated_at: Date;
}

/** A Household's appliance list in `public.appliances`; saving replaces every row in one transaction. */
export class PgApplianceRepository implements ApplianceRepository {
  constructor(private readonly sql: Sql) {}

  async find(sin: string): Promise<StoredAppliances | null> {
    const rows = await this.sql<ApplianceRow[]>`
      select type, quantity, answers, time_ranges, uses_per_week, energy_label, updated_at
      from public.appliances where sin = ${sin} order by position`;
    if (rows.length === 0) return null;
    const appliances = rows.map((row) => {
      const appliance: ApplianceInput = { type: row.type as ApplianceInput["type"], quantity: row.quantity };
      if (row.answers !== null) appliance.answers = row.answers;
      if (row.time_ranges !== null) appliance.timeRanges = row.time_ranges;
      if (row.uses_per_week !== null) appliance.usesPerWeek = Number(row.uses_per_week);
      if (row.energy_label !== null) appliance.energyLabel = row.energy_label;
      return appliance;
    });
    return { appliances, updatedAt: new Date(rows[0]!.updated_at).toISOString() };
  }

  async save(sin: string, appliances: ApplianceInput[]): Promise<StoredAppliances> {
    const updatedAt = new Date();
    await this.sql.begin(async (tx) => {
      await tx`delete from public.appliances where sin = ${sin}`;
      if (appliances.length === 0) return;
      const rows = appliances.map((a, position) => ({
        sin,
        position,
        type: a.type,
        quantity: a.quantity ?? 1,
        answers: a.answers ? tx.json(a.answers as never) : null,
        time_ranges: a.timeRanges ? tx.json(a.timeRanges as never) : null,
        uses_per_week: a.usesPerWeek ?? null,
        energy_label: a.energyLabel ? tx.json(a.energyLabel as never) : null,
        updated_at: updatedAt,
      }));
      await tx`insert into public.appliances ${tx(rows)}`;
    });
    return { appliances: structuredClone(appliances), updatedAt: updatedAt.toISOString() };
  }
}
