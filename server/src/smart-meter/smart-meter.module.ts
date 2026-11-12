import { Module } from "@nestjs/common";
import { DATABASE, READING_SOURCE, USAGE_PLAN_REPOSITORY } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgReadingSource } from "../database/pg-reading.source.js";
import { HouseholdsModule } from "../households/households.module.js";
import { PlansModule } from "../usage-plan/plans.module.js";
import type { UsagePlanRepository } from "../usage-plan/usage-plan-repository.interface.js";
import { MockReadingSource } from "./mock-reading-source.provider.js";
import { SmartMeterController } from "./smart-meter.controller.js";
import { SmartMeterService } from "./smart-meter.service.js";

@Module({
  imports: [HouseholdsModule, PlansModule],
  controllers: [SmartMeterController],
  providers: [
    SmartMeterService,
    {
      provide: READING_SOURCE,
      inject: [DATABASE, USAGE_PLAN_REPOSITORY],
      useFactory: (db: Sql | null, plans: UsagePlanRepository) => (db ? new PgReadingSource(db, plans) : new MockReadingSource(plans)),
    },
  ],
  exports: [READING_SOURCE],
})
export class SmartMeterModule {}
