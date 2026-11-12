import { Module } from "@nestjs/common";
import { DATABASE, POINTS_REPOSITORY } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgPointsRepository } from "../database/pg-points.repository.js";
import { InMemoryPointsRepository } from "../usage-plan/in-memory-points.repository.js";

/** The one Points ledger per Household: Verified Savings, Welcome Points and redemptions. */
@Module({
  providers: [{ provide: POINTS_REPOSITORY, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgPointsRepository(db) : new InMemoryPointsRepository()) }],
  exports: [POINTS_REPOSITORY],
})
export class PointsModule {}
