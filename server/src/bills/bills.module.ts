import { Module } from "@nestjs/common";
import { MeralcoApiSource } from "./meralcoApiSource.js";
import { inMemoryOutageSource } from "./outage-source.js";
import { HouseholdsModule } from "../households/households.module.js";
import { BILL_SOURCE, DATABASE, OUTAGE_SOURCE } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgMeralcoSource } from "../database/pg-meralco.source.js";
import { PgOutageSource } from "../database/pg-outage.source.js";
import { BillHistoryController } from "./bill-history.controller.js";

/**
 * The mock My Meralco Bill source (Supabase's `meralco` schema, or in memory) and its authorized history endpoint.
 */
@Module({
  imports: [HouseholdsModule],
  controllers: [BillHistoryController],
  providers: [
    { provide: BILL_SOURCE, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgMeralcoSource(db) : new MeralcoApiSource()) },
    { provide: OUTAGE_SOURCE, inject: [DATABASE], useFactory: (db: Sql | null) => (db ? new PgOutageSource(db) : inMemoryOutageSource()) },
  ],
  exports: [BILL_SOURCE, OUTAGE_SOURCE],
})
export class BillsModule {}
