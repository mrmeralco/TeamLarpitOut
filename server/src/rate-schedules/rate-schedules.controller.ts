import { Controller, Get, Inject } from "@nestjs/common";
import { RATE_SCHEDULES } from "../common/injection-tokens.js";
import type { RateScheduleTable } from "../domain/rate-schedule.js";

@Controller("rate-schedules")
export class RateSchedulesController {
  constructor(@Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable) {}

  @Get()
  list() {
    return { periods: this.rates.periods() };
  }
}
