import type { Bill } from "../domain/bill.js";

/**
 * Where a Household's Bills come from. Later tickets add UploadSource (bill
 * photo) and MeralcoApiSource (mock My Meralco); tests inject fakes.
 */
export interface BillSource {
  /** Bills for one Household (Service ID Number), oldest first. */
  bills(sin: string): Promise<Bill[]>;
}

/** In-memory source keyed by Service ID Number; the default and the test fake. */
export function inMemoryBillSource(byHousehold: Record<string, Bill[]> = {}): BillSource {
  return {
    async bills(sin) {
      return [...(byHousehold[sin] ?? [])].sort((a, b) => a.period.localeCompare(b.period));
    },
  };
}
