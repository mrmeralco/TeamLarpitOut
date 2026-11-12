/**
 * Which login a Household is linked to. A link starts `pending` when a CAN is
 * typed and becomes `active` when a scanned Bill shows the same CAN (ADR-0005).
 */
export interface HouseholdLink {
  ownerId: string;
  sin: string;
  can: string;
  status: "pending" | "active";
}

export interface HouseholdLinkRepository {
  forOwner(ownerId: string): Promise<HouseholdLink[]>;
  save(link: HouseholdLink): Promise<void>;
  remove(ownerId: string, sin: string): Promise<void>;
}

export class InMemoryHouseholdLinkRepository implements HouseholdLinkRepository {
  private readonly links: HouseholdLink[];

  constructor(seed: HouseholdLink[] = []) {
    this.links = structuredClone(seed);
  }

  async forOwner(ownerId: string) {
    return structuredClone(this.links.filter((l) => l.ownerId === ownerId));
  }

  async save(link: HouseholdLink) {
    const i = this.links.findIndex((l) => l.ownerId === link.ownerId && l.sin === link.sin);
    if (i >= 0) this.links[i] = structuredClone(link);
    else this.links.push(structuredClone(link));
  }

  async remove(ownerId: string, sin: string) {
    const i = this.links.findIndex((l) => l.ownerId === ownerId && l.sin === sin);
    if (i >= 0) this.links.splice(i, 1);
  }
}
