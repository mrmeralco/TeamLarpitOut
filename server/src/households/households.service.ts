import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { MyMeralcoSource } from "../bills/myMeralcoSource.js";
import { MY_MERALCO_SOURCE } from "../common/injection-tokens.js";
import type { Household, HouseholdChange } from "../domain/household.js";

@Injectable()
export class HouseholdsService {
  private readonly changes = new Map<string, HouseholdChange[]>();

  constructor(@Inject(MY_MERALCO_SOURCE) private readonly meralco: MyMeralcoSource) {}

  async list(ownerId: string): Promise<Household[]> {
    const list = await this.meralco.households(ownerId);
    return list.map((h) => {
      const hhChanges = this.changes.get(h.sin);
      return {
        ...h,
        ...(hhChanges && hhChanges.length > 0 ? { changes: structuredClone(hhChanges) } : {}),
      };
    });
  }

  async getChanges(sin: string): Promise<HouseholdChange[]> {
    return structuredClone(this.changes.get(sin) ?? []);
  }

  async addChange(sin: string, change: HouseholdChange): Promise<HouseholdChange> {
    const list = this.changes.get(sin) ?? [];
    const item: HouseholdChange = {
      ...change,
      recordedAt: change.recordedAt ?? new Date().toISOString(),
    };
    list.push(item);
    this.changes.set(sin, list);
    return item;
  }

  async requireAccess(ownerId: string, sin: string): Promise<Household> {
    const household = (await this.list(ownerId)).find((entry) => entry.sin === sin);
    if (!household) {
      // Unknown and foreign services have the same response to avoid disclosing ownership.
      throw new NotFoundException({ error: "Hindi makita ang Household." });
    }
    return household;
  }
}
