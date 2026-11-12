import { Module } from "@nestjs/common";
import { DATABASE, REWARDS_CATALOG } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgRewardsCatalog } from "../database/pg-rewards.catalog.js";
import { inMemoryRewardsCatalog } from "../domain/rewards.js";
import { HouseholdsModule } from "../households/households.module.js";
import { UsagePlanModule } from "../usage-plan/usage-plan.module.js";
import { RewardsController } from "./rewards.controller.js";
import { RewardsService } from "./rewards.service.js";

@Module({
  imports: [HouseholdsModule, UsagePlanModule],
  controllers: [RewardsController],
  providers: [
    RewardsService,
    { provide: REWARDS_CATALOG, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgRewardsCatalog(db) : inMemoryRewardsCatalog()) },
  ],
  exports: [RewardsService],
})
export class RewardsModule {}
