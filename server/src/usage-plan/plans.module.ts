import { Module } from "@nestjs/common";
import { USAGE_PLAN_REPOSITORY } from "../common/injection-tokens.js";
import { InMemoryUsagePlanRepository } from "./in-memory-usage-plan.repository.js";

/** The one Mission Plan store per Household, shared with the mock smart meter (it simulates following the plan). */
@Module({
  providers: [{ provide: USAGE_PLAN_REPOSITORY, useFactory: () => new InMemoryUsagePlanRepository() }],
  exports: [USAGE_PLAN_REPOSITORY],
})
export class PlansModule {}
