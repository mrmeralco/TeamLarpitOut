import demo from "../data/meralco-demo.json" with { type: "json" };
import { HouseholdStore } from "../households/household-store.js";
import type { Bill } from "../domain/bill.js";
import type { BillSource } from "./bill-source.js";

/** In-process mock Meralco API adapter. Ownership is enforced before reading it. */
export class MeralcoApiSource implements BillSource {
  constructor(private readonly store = new HouseholdStore()) {
    for (const household of demo.households) this.store.setBills(household.sin, household.bills);
  }

  async bills(sin: string) {
    return this.store.bills(sin);
  }

  async setBills(sin: string, bills: Bill[]) {
    this.store.setBills(sin, bills);
  }
}
