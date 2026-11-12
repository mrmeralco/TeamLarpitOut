import { Module } from "@nestjs/common";
import { MeralcoApiSource } from "./meralcoApiSource.js";
import { HouseholdsModule } from "../households/households.module.js";
import { BILL_SOURCE } from "../common/injection-tokens.js";
import { BillHistoryController } from "./bill-history.controller.js";

/**
 * The mock My Meralco Bill source and its authorized history endpoint.
 */
@Module({
  imports: [HouseholdsModule],
  controllers: [BillHistoryController],
  providers: [{ provide: BILL_SOURCE, useFactory: () => new MeralcoApiSource() }],
  exports: [BILL_SOURCE],
})
export class BillsModule {}
