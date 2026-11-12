import { Module } from "@nestjs/common";
import { RATE_SCHEDULES } from "../common/injection-tokens.js";
import table from "../data/rate-schedules.json" with { type: "json" };
import { rateScheduleTable, type RateSchedule } from "../domain/rate-schedule.js";
import { RateSchedulesController } from "./rate-schedules.controller.js";

/** The one Rate Schedule table (ADR-0001), loaded from data/rate-schedules.json. */
@Module({
  controllers: [RateSchedulesController],
  providers: [{ provide: RATE_SCHEDULES, useValue: rateScheduleTable(table.schedules as RateSchedule[]) }],
  exports: [RATE_SCHEDULES],
})
export class RateSchedulesModule {}
