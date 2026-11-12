import { Module } from "@nestjs/common";
import { AppliancesModule } from "../appliances/appliances.module.js";
import { BillsModule } from "../bills/bills.module.js";
import { CoachModule } from "../coach/coach.module.js";
import { DATABASE, MID_MONTH_READING_REPOSITORY, USAGE_PLAN_REPOSITORY } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgMidMonthReadingRepository } from "../database/pg-mid-month-reading.repository.js";
import { PgUsagePlanRepository } from "../database/pg-usage-plan.repository.js";
import { PointsModule } from "../points/points.module.js";
import { SetupModule } from "../setup/setup.module.js";
import { HouseholdsModule } from "../households/households.module.js";
import { RateSchedulesModule } from "../rate-schedules/rate-schedules.module.js";
import { WeatherModule } from "../weather/weather.module.js";
import { InMemoryMidMonthReadingRepository } from "./in-memory-mid-month-reading.repository.js";
import { InMemoryUsagePlanRepository } from "./in-memory-usage-plan.repository.js";
import { UsagePlanController } from "./usage-plan.controller.js";
import { UsagePlanService } from "./usage-plan.service.js";
import { MissionPlanService } from "./mission-plan.service.js";

@Module({
  imports: [HouseholdsModule, BillsModule, RateSchedulesModule, WeatherModule, AppliancesModule, CoachModule, PointsModule, SetupModule],
  controllers: [UsagePlanController],
  providers: [
    UsagePlanService,
    MissionPlanService,
    { provide: USAGE_PLAN_REPOSITORY, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgUsagePlanRepository(db) : new InMemoryUsagePlanRepository()) },
    { provide: MID_MONTH_READING_REPOSITORY, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgMidMonthReadingRepository(db) : new InMemoryMidMonthReadingRepository()) },
  ],
  exports: [UsagePlanService, PointsModule],
})
export class UsagePlanModule {}
