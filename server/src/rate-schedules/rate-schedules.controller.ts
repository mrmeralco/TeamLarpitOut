import { BadRequestException, Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { RATE_SCHEDULES } from "../common/injection-tokens.js";
import type { RateScheduleTable } from "../domain/rate-schedule.js";

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Meralco's Rate Schedules: the same for every residential customer, so no login is needed. */
@Controller("rate-schedules")
export class RateSchedulesController {
  constructor(@Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable) {}

  @Get()
  list() {
    return { periods: this.rates.periods() };
  }

  /** One billing month's charges. Per-kWh rates and fixed amounts are in pesos. */
  @Get(":period")
  one(@Param("period") period: string) {
    if (!PERIOD.test(period)) throw new BadRequestException({ error: "Use a billing month like 2026-11." });
    const schedule = this.rates.get(period);
    if (!schedule) throw new NotFoundException({ error: `There is no Rate Schedule for ${period}.`, periods: this.rates.periods() });
    return {
      currency: "PHP",
      period,
      /** Every per-kWh charge added up: what one more kWh costs before lifeline discounts. */
      perKwhTotal: Math.round(schedule.perKwh.reduce((s, c) => s + c.rate, 0) * 10_000) / 10_000,
      perKwh: schedule.perKwh,
      fixed: schedule.fixed,
      lifeline: schedule.lifeline ?? null,
    };
  }
}
