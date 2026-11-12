import type { FixedCharge, LifelineRule, PerKwhCharge, RateSchedule } from "../domain/rate-schedule.js";
import type { Sql } from "./database.module.js";

interface ScheduleRow { period: string; per_kwh: PerKwhCharge[]; fixed: FixedCharge[]; lifeline: LifelineRule | null }

/** Every Rate Schedule in `meralco.rate_schedules`, oldest first. Read once when the server starts. */
export async function loadRateSchedules(sql: Sql): Promise<RateSchedule[]> {
  const rows = await sql<ScheduleRow[]>`select period, per_kwh, fixed, lifeline from meralco.rate_schedules order by period`;
  return rows.map((r) => ({ period: r.period, perKwh: r.per_kwh, fixed: r.fixed, ...(r.lifeline ? { lifeline: r.lifeline } : {}) }));
}
