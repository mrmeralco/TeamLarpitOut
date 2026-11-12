import type { Bill } from "../domain/bill.js";

/**
 * Where a Household's Bills come from. MeralcoApiSource serves mock My Meralco
 * history; tests inject fakes. A later ticket can add an upload source.
 */
export interface BillSource {
  /** Bills for one Household (Service ID Number), oldest first. */
  bills(sin: string): Promise<Bill[]>;
}

/** In-memory source keyed by Service ID Number; used by test fakes. */
export function inMemoryBillSource(byHousehold: Record<string, Bill[]> = {}): BillSource {
  return {
    async bills(sin) {
      return [...(byHousehold[sin] ?? [])].sort((a, b) => a.period.localeCompare(b.period));
    },
  };
}
