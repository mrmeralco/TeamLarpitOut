import { Module } from "@nestjs/common";
import { inMemoryBillSource } from "../sources/billSource.js";
import { BILL_SOURCE } from "../tokens.js";

/**
 * Provides the Household Bill source. Empty in-memory for now; ticket 03 swaps
 * in MeralcoApiSource (mock My Meralco) behind the same token.
 */
@Module({
  providers: [{ provide: BILL_SOURCE, useValue: inMemoryBillSource() }],
  exports: [BILL_SOURCE],
})
export class BillsModule {}
