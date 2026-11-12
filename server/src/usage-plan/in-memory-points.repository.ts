import type { PointsEntry, PointsRepository } from "./points-repository.interface.js";

/** Demo points ledger keyed by Service ID Number; lost on restart. */
export class InMemoryPointsRepository implements PointsRepository {
  private readonly byHousehold = new Map<string, PointsEntry[]>();

  async getEntries(sin: string): Promise<PointsEntry[]> {
    return structuredClone(this.byHousehold.get(sin) ?? []);
  }

  async addEntry(sin: string, entry: PointsEntry): Promise<void> {
    const list = this.byHousehold.get(sin) ?? [];
    list.push(structuredClone(entry));
    this.byHousehold.set(sin, list);
  }

  async getBalance(sin: string): Promise<number> {
    const list = this.byHousehold.get(sin) ?? [];
    return list.reduce((sum, e) => sum + e.points, 0);
  }
}
