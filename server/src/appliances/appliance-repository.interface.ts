import type { ApplianceInput } from "../domain/appliance-usage.js";

export interface StoredAppliances {
  appliances: ApplianceInput[];
  updatedAt: string;
}

/** Appliances saved per Household (Service ID Number). */
export interface ApplianceRepository {
  find(sin: string): Promise<StoredAppliances | null>;
  save(sin: string, appliances: ApplianceInput[]): Promise<StoredAppliances>;
}
