import type { ApplianceInput } from "../domain/appliance-usage.js";
import type { ApplianceRepository, StoredAppliances } from "./appliance-repository.interface.js";

/** Demo storage keyed by Service ID Number; snapshots never share mutable data. Lost on restart. */
export class InMemoryApplianceRepository implements ApplianceRepository {
  private readonly byHousehold = new Map<string, StoredAppliances>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async find(sin: string): Promise<StoredAppliances | null> {
    const stored = this.byHousehold.get(sin);
    return stored ? structuredClone(stored) : null;
  }

  async save(sin: string, appliances: ApplianceInput[]): Promise<StoredAppliances> {
    const stored = { appliances: structuredClone(appliances), updatedAt: this.now().toISOString() };
    this.byHousehold.set(sin, stored);
    return structuredClone(stored);
  }
}
