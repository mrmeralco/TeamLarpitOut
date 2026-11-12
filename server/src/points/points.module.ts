import { Module } from "@nestjs/common";
import { POINTS_REPOSITORY } from "../common/injection-tokens.js";
import { InMemoryPointsRepository } from "../usage-plan/in-memory-points.repository.js";

/** The one Points ledger per Household: Verified Savings, Welcome Points and redemptions. */
@Module({
  providers: [{ provide: POINTS_REPOSITORY, useFactory: () => new InMemoryPointsRepository() }],
  exports: [POINTS_REPOSITORY],
})
export class PointsModule {}
