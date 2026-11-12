import { Module } from "@nestjs/common";
import { READING_SOURCE, USAGE_PLAN_REPOSITORY } from "../common/injection-tokens.js";
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
    { provide: READING_SOURCE, inject: [USAGE_PLAN_REPOSITORY], useFactory: (plans: UsagePlanRepository) => new MockReadingSource(plans) },
  ],
  exports: [READING_SOURCE],
})
export class SmartMeterModule {}
