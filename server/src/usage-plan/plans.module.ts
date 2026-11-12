import { Module } from "@nestjs/common";
import { DATABASE, USAGE_PLAN_REPOSITORY } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgUsagePlanRepository } from "../database/pg-usage-plan.repository.js";
import { InMemoryUsagePlanRepository } from "./in-memory-usage-plan.repository.js";

/** The one Mission Plan store per Household, shared with the mock smart meter (it simulates following the plan). */
@Module({
  providers: [
    { provide: USAGE_PLAN_REPOSITORY, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgUsagePlanRepository(db) : new InMemoryUsagePlanRepository()) },
  ],
  exports: [USAGE_PLAN_REPOSITORY],
})
export class PlansModule {}
