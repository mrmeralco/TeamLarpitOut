import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { toHousehold, type MeralcoAccountSource } from "../bills/meralco-accounts.js";
import { HOUSEHOLD_LINKS, MERALCO_ACCOUNTS } from "../common/injection-tokens.js";
import type { Household, HouseholdChange } from "../domain/household.js";
import type { HouseholdLink, HouseholdLinkRepository } from "./household-link.repository.js";

export const OWNED_BY_ANOTHER = "Naka-link na ang account na ito sa ibang login. Kausapin ang may-ari ng account.";
export const SCAN_TO_CONFIRM = "I-scan muna ang pinakabagong Bill na may parehong CAN para mabuksan ang Household.";

/** Shows a CAN like "39•• ••• 482": enough to recognise, not enough to reuse. */
export function maskCan(can: string): string {
  const d = can.replace(/\D/g, "");
  if (d.length < 6) return "•".repeat(d.length);
  return `${d.slice(0, 2)}•• ••• ${d.slice(-3)}`;
}

/** What the scan did to this login's pending link. */
export type LinkActivation =
  | { status: "active"; householdSin: string; canMasked: string }
  | { status: "pending"; reason: "differentAccount" | "canUnread"; canMasked: string }
  | { status: "refused"; reason: "ownedByAnother"; message: string }
  | { status: "none" };

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

  /** The login's pending link (at most one), if any. */
  async pendingLink(ownerId: string): Promise<HouseholdLink | null> {
    return (await this.links.forOwner(ownerId)).find((l) => l.status === "pending") ?? null;
  }

  async pendingAccount(ownerId: string) {
    const link = await this.pendingLink(ownerId);
    return link ? this.meralco.household(link.sin) : null;
  }

  /**
   * Typing a CAN starts a pending link (replacing any earlier pending one).
   * Refused when another login already holds the active link.
   */
  async startLink(ownerId: string, can: string) {
    const account = await this.meralco.findByCan(can);
    if (!account) throw new NotFoundException({ error: "Walang Meralco account na may ganitong CAN. Tingnan ulit ang Bill." });
    const owner = await this.links.activeOwner(account.sin);
    if (owner !== null && owner !== ownerId) throw new ConflictException({ error: OWNED_BY_ANOTHER, reason: "ownedByAnother" });
    if (owner === ownerId) return { account, status: "active" as const };
    const previous = await this.pendingLink(ownerId);
    if (previous && previous.sin !== account.sin) await this.links.remove(ownerId, previous.sin);
    await this.links.save({ ownerId, sin: account.sin, can: account.can, status: "pending" });
    return { account, status: "pending" as const };
  }

  /** A scanned (or typed-from-the-Bill) CAN activates the pending link only when it is the same CAN. */
  async activateFromScan(ownerId: string, scannedCan: string | null): Promise<LinkActivation> {
    const pending = await this.pendingLink(ownerId);
    if (!pending) return { status: "none" };
    const canMasked = maskCan(pending.can);
    if (scannedCan === null) return { status: "pending", reason: "canUnread", canMasked };
    if (scannedCan !== pending.can) return { status: "pending", reason: "differentAccount", canMasked };
    const owner = await this.links.activeOwner(pending.sin);
    if (owner !== null && owner !== ownerId) return { status: "refused", reason: "ownedByAnother", message: OWNED_BY_ANOTHER };
    await this.links.save({ ...pending, status: "active" });
    return { status: "active", householdSin: pending.sin, canMasked };
  }

  async requireAccess(ownerId: string, sin: string): Promise<Household> {
    const household = (await this.list(ownerId)).find((entry) => entry.sin === sin);
    if (!household) {
      if ((await this.pendingLink(ownerId))?.sin === sin) {
        throw new ForbiddenException({ error: SCAN_TO_CONFIRM, reason: "pendingScan" });
      }
      // Unknown and foreign services have the same response to avoid disclosing ownership.
      throw new NotFoundException({ error: "Hindi makita ang Household." });
    }
    return household;
  }
}
