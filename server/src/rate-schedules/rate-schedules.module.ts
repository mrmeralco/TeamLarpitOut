import { Logger, Module } from "@nestjs/common";
import { DATABASE, RATE_SCHEDULES } from "../common/injection-tokens.js";
import table from "../data/rate-schedules.json" with { type: "json" };
import type { Sql } from "../database/database.module.js";
import { loadRateSchedules } from "../database/pg-rate-schedules.js";
import { rateScheduleTable, type RateSchedule } from "../domain/rate-schedule.js";
import { RateSchedulesController } from "./rate-schedules.controller.js";

/**
 * The one Rate Schedule table (ADR-0001): `meralco.rate_schedules` when DATABASE_URL is set,
 * read once at start, else data/rate-schedules.json. An empty table also falls back to the file.
 */
@Module({
  controllers: [RateSchedulesController],
  providers: [{
    provide: RATE_SCHEDULES,
    inject: [DATABASE],
    useFactory: async (db: Sql | null) => {
      const stored = db ? await loadRateSchedules(db) : [];
      if (db && !stored.length) new Logger("RateSchedules").warn("meralco.rate_schedules is empty; using data/rate-schedules.json. Run pnpm db:seed.");
      return rateScheduleTable(stored.length ? stored : (table.schedules as RateSchedule[]));
    },
  }],
  exports: [RATE_SCHEDULES],
})
export class RateSchedulesModule {}
