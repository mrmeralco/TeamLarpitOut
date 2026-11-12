import { Module } from "@nestjs/common";
import { DATABASE, MERALCO_ACCOUNTS } from "../common/injection-tokens.js";
import type { Sql } from "../database/database.module.js";
import { PgMeralcoSource } from "../database/pg-meralco.source.js";
import { DEMO_ACCOUNTS, mockMeralcoAccounts } from "./meralco-accounts.js";
import { meralcoAccountOf, realBillHousehold } from "./real-bill-household.js";

/** CAN lookup: Supabase's `meralco` schema when DATABASE_URL is set, else the in-memory mock. */
@Module({
  providers: [{
    provide: MERALCO_ACCOUNTS,
    inject: [DATABASE],
    useFactory: (db: Sql | null) => db
      ? new PgMeralcoSource(db)
      : mockMeralcoAccounts([...DEMO_ACCOUNTS, meralcoAccountOf(realBillHousehold())]),
  }],
  exports: [MERALCO_ACCOUNTS],
})
export class MeralcoAccountsModule {}
