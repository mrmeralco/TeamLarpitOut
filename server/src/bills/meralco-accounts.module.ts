import { Module } from "@nestjs/common";
import { MERALCO_ACCOUNTS } from "../common/injection-tokens.js";
import { mockMeralcoAccounts } from "./meralco-accounts.js";

@Module({
  providers: [{ provide: MERALCO_ACCOUNTS, useFactory: () => mockMeralcoAccounts() }],
  exports: [MERALCO_ACCOUNTS],
})
export class MeralcoAccountsModule {}
