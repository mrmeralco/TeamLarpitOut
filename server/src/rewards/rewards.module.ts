import { Module } from "@nestjs/common";
import { HouseholdsModule } from "../households/households.module.js";
import { UsagePlanModule } from "../usage-plan/usage-plan.module.js";
import { RewardsController } from "./rewards.controller.js";
import { RewardsService } from "./rewards.service.js";

@Module({
  imports: [HouseholdsModule, UsagePlanModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
