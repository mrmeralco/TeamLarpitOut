import type { Bill } from "../domain/bill.js";

/** Demo storage. All records are keyed by SIN; snapshots never share mutable data. */
export class HouseholdStore {
  private readonly histories = new Map<string, Bill[]>();

  setBills(sin: string, bills: Bill[]): void {
    this.histories.set(sin, structuredClone(bills).sort((a, b) => a.period.localeCompare(b.period)));
  }

  bills(sin: string): Bill[] {
    return structuredClone(this.histories.get(sin) ?? []);
  }
}
