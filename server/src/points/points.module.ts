import { Module } from "@nestjs/common";
import { systemClock } from "../common/clock.js";
import { CLOCK, POINTS_REPOSITORY } from "../common/injection-tokens.js";
import { InMemoryPointsRepository } from "../usage-plan/in-memory-points.repository.js";

/** The one Points ledger per Household (Verified Savings, Welcome Points and redemptions) and the clock that dates it. */
@Module({
  providers: [
    { provide: POINTS_REPOSITORY, useFactory: () => new InMemoryPointsRepository() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [POINTS_REPOSITORY, CLOCK],
})
export class PointsModule {}
