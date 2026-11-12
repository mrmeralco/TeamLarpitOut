import { Module } from "@nestjs/common";
import { systemClock } from "../common/clock.js";
import { CLOCK, DATABASE, POINTS_REPOSITORY } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgPointsRepository } from "../database/pg-points.repository.js";
import { InMemoryPointsRepository } from "../usage-plan/in-memory-points.repository.js";

/** The one Points ledger per Household (Verified Savings, Welcome Points and redemptions) and the clock that dates it. */
@Module({
  providers: [
    { provide: POINTS_REPOSITORY, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgPointsRepository(db) : new InMemoryPointsRepository()) },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [POINTS_REPOSITORY, CLOCK],
})
export class PointsModule {}
