import type { HouseholdChange } from "../domain/household.js";

/** Recorded changes in a Household (new appliance, guests…) that explain a Bill; oldest first. */
export interface HouseholdChangeRepository {
  forHousehold(sin: string): Promise<HouseholdChange[]>;
  add(sin: string, change: Required<Pick<HouseholdChange, "reason" | "recordedAt">> & HouseholdChange): Promise<void>;
}

export class InMemoryHouseholdChangeRepository implements HouseholdChangeRepository {
  private readonly changes = new Map<string, HouseholdChange[]>();

  async forHousehold(sin: string) {
    return structuredClone(this.changes.get(sin) ?? []);
  }

  async add(sin: string, change: HouseholdChange) {
    this.changes.set(sin, [...(this.changes.get(sin) ?? []), structuredClone(change)]);
  }
}
