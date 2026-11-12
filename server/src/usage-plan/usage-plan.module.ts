import { Module } from "@nestjs/common";
import { AppliancesModule } from "../appliances/appliances.module.js";
import { BillsModule } from "../bills/bills.module.js";
import { CoachModule } from "../coach/coach.module.js";
import { USAGE_PLAN_REPOSITORY } from "../common/injection-tokens.js";
import { HouseholdsModule } from "../households/households.module.js";
import { RateSchedulesModule } from "../rate-schedules/rate-schedules.module.js";
import { WeatherModule } from "../weather/weather.module.js";
import { InMemoryUsagePlanRepository } from "./in-memory-usage-plan.repository.js";
import { UsagePlanController } from "./usage-plan.controller.js";
import { UsagePlanService } from "./usage-plan.service.js";

@Module({
  imports: [HouseholdsModule, BillsModule, RateSchedulesModule, WeatherModule, AppliancesModule, CoachModule],
  controllers: [UsagePlanController],
  providers: [UsagePlanService, { provide: USAGE_PLAN_REPOSITORY, useFactory: () => new InMemoryUsagePlanRepository() }],
})
export class UsagePlanModule {}
