import type { Bill } from "../domain/bill.js";

/**
 * Where a Household's Bills come from. MeralcoApiSource serves mock My Meralco
 * history; tests inject fakes. A later ticket can add an upload source.
 */
export interface BillSource {
  /** Bills for one Household (Service ID Number), oldest first. */
  bills(sin: string): Promise<Bill[]>;
  /** Demo mode only: stores the History of a Household made for a scanned Bill. */
  setBills?(sin: string, bills: Bill[]): Promise<void>;
}

/** In-memory source keyed by Service ID Number; used by test fakes. */
export function inMemoryBillSource(byHousehold: Record<string, Bill[]> = {}): BillSource {
  const histories: Record<string, Bill[]> = { ...byHousehold };
  return {
    async bills(sin) {
      return [...(histories[sin] ?? [])].sort((a, b) => a.period.localeCompare(b.period));
    },
    async setBills(sin, bills) {
      histories[sin] = structuredClone(bills);
    },
  };
}
