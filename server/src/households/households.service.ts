import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { toHousehold, type MeralcoAccountSource } from "../bills/meralco-accounts.js";
import { HOUSEHOLD_CHANGES, HOUSEHOLD_LINKS, MERALCO_ACCOUNTS } from "../common/injection-tokens.js";
import type { Household, HouseholdChange } from "../domain/household.js";
import type { HouseholdChangeRepository } from "./household-change.repository.js";
import type { HouseholdLinkRepository } from "./household-link.repository.js";

/** Shows a CAN like "39•• ••• 482": enough to recognise, not enough to reuse. */
export function maskCan(can: string): string {
  const d = can.replace(/\D/g, "");
  if (d.length < 6) return "•".repeat(d.length);
  return `${d.slice(0, 2)}•• ••• ${d.slice(-3)}`;
}


@Injectable()
export class HouseholdsService {
  constructor(
    @Inject(MERALCO_ACCOUNTS) private readonly meralco: MeralcoAccountSource,
    @Inject(HOUSEHOLD_LINKS) private readonly links: HouseholdLinkRepository,
    @Inject(HOUSEHOLD_CHANGES) private readonly changes: HouseholdChangeRepository,
  ) {}

  /** Active Households of this login, with masked addresses and Meter Types from Meralco. */
  async list(ownerId: string): Promise<Household[]> {
    // Every Household's account and changes are read together, not one after another.
    const links = (await this.links.forOwner(ownerId)).filter((link) => link.status === "active");
    const rows = await Promise.all(links.map(async (link) => {
      const [account, changes] = await Promise.all([this.meralco.household(link.sin), this.changes.forHousehold(link.sin)]);
      return account ? { ...toHousehold(account), ...(changes.length > 0 ? { changes } : {}) } : null;
    }));
    return rows.filter((h): h is Household => h !== null);
  }

  async getChanges(sin: string): Promise<HouseholdChange[]> {
    return this.changes.forHousehold(sin);
  }

  async addChange(sin: string, change: HouseholdChange): Promise<HouseholdChange> {
    const item = { ...change, recordedAt: change.recordedAt ?? new Date().toISOString() };
    await this.changes.add(sin, item);
    return item;
  }


  /** The masked CAN this login linked the Household with. */
  async canMasked(ownerId: string, sin: string): Promise<string | null> {
    const link = (await this.links.forOwner(ownerId)).find((l) => l.sin === sin);
    return link ? maskCan(link.can) : null;
  }




  async requireAccess(ownerId: string, sin: string): Promise<Household> {
    const household = (await this.list(ownerId)).find((entry) => entry.sin === sin);
    if (!household) {
      // Unknown and foreign services have the same response to avoid disclosing ownership.
      throw new NotFoundException({ error: "Household not found." });
    }
    return household;
  }
}
