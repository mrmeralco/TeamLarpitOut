import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { toHousehold, type MeralcoAccountSource } from "../bills/meralco-accounts.js";
import { HOUSEHOLD_LINKS, MERALCO_ACCOUNTS } from "../common/injection-tokens.js";
import type { Household, HouseholdChange } from "../domain/household.js";
import type { HouseholdLinkRepository } from "./household-link.repository.js";

@Injectable()
export class HouseholdsService {
  private readonly changes = new Map<string, HouseholdChange[]>();

  constructor(
    @Inject(MERALCO_ACCOUNTS) private readonly meralco: MeralcoAccountSource,
    @Inject(HOUSEHOLD_LINKS) private readonly links: HouseholdLinkRepository,
  ) {}

  /** Active Households of this login, with masked addresses and Meter Types from Meralco. */
  async list(ownerId: string): Promise<Household[]> {
    const out: Household[] = [];
    for (const link of await this.links.forOwner(ownerId)) {
      if (link.status !== "active") continue;
      const account = await this.meralco.household(link.sin);
      if (!account) continue;
      const hhChanges = this.changes.get(link.sin);
      out.push({
        ...toHousehold(account),
        ...(hhChanges && hhChanges.length > 0 ? { changes: structuredClone(hhChanges) } : {}),
      });
    }
    return out;
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
