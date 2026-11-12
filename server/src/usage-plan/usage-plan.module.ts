import { Module } from "@nestjs/common";
import { AppliancesModule } from "../appliances/appliances.module.js";
import { BillsModule } from "../bills/bills.module.js";
import { CoachModule } from "../coach/coach.module.js";
import { DATABASE, MID_MONTH_READING_REPOSITORY } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgMidMonthReadingRepository } from "../database/pg-mid-month-reading.repository.js";
import { PointsModule } from "../points/points.module.js";
import { SetupModule } from "../setup/setup.module.js";
import { HouseholdsModule } from "../households/households.module.js";
import { RateSchedulesModule } from "../rate-schedules/rate-schedules.module.js";
import { SmartMeterModule } from "../smart-meter/smart-meter.module.js";
import { WeatherModule } from "../weather/weather.module.js";
import { DailyPointsService } from "./daily-points.service.js";
import { InMemoryMidMonthReadingRepository } from "./in-memory-mid-month-reading.repository.js";
import { PlansModule } from "./plans.module.js";
import { UsagePlanController } from "./usage-plan.controller.js";
import { UsagePlanService } from "./usage-plan.service.js";
import { MissionPlanService } from "./mission-plan.service.js";

@Module({
  imports: [
    HouseholdsModule, BillsModule, RateSchedulesModule, WeatherModule, AppliancesModule, CoachModule,
    PointsModule, SetupModule, PlansModule, SmartMeterModule,
  ],
  controllers: [UsagePlanController],
  providers: [
    UsagePlanService,
    MissionPlanService,
    DailyPointsService,
    { provide: MID_MONTH_READING_REPOSITORY, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgMidMonthReadingRepository(db) : new InMemoryMidMonthReadingRepository()) },
  ],
  exports: [UsagePlanService, PointsModule],
})
export class UsagePlanModule {}
