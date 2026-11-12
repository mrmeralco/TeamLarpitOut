import { Controller, Get, Inject, Module } from "@nestjs/common";
import table from "../data/rate-schedules.json" with { type: "json" };
import { rateScheduleTable, type RateSchedule, type RateScheduleTable } from "../domain/rateSchedule.js";
import { RATE_SCHEDULES } from "../tokens.js";

@Controller("rate-schedules")
export class RateSchedulesController {
  constructor(@Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable) {}

  @Get()
  list() {
    return { periods: this.rates.periods() };
  }
}

/** The one Rate Schedule table (ADR-0001), loaded from data/rate-schedules.json. */
@Module({
  controllers: [RateSchedulesController],
  providers: [
    { provide: RATE_SCHEDULES, useValue: rateScheduleTable(table.schedules as RateSchedule[]) },
  ],
  exports: [RATE_SCHEDULES],
})
export class RateSchedulesModule {}
