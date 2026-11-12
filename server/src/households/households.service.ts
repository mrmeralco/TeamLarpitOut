import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { toHousehold, type MeralcoAccountSource } from "../bills/meralco-accounts.js";
import { HOUSEHOLD_LINKS, MERALCO_ACCOUNTS } from "../common/injection-tokens.js";
import type { Household, HouseholdChange } from "../domain/household.js";
import type { HouseholdLinkRepository } from "./household-link.repository.js";

/** Shows a CAN like "39•• ••• 482": enough to recognise, not enough to reuse. */
export function maskCan(can: string): string {
  const d = can.replace(/\D/g, "");
  if (d.length < 6) return "•".repeat(d.length);
  return `${d.slice(0, 2)}•• ••• ${d.slice(-3)}`;
}


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
