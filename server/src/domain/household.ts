export interface HouseholdChange {
  reason: string;
  period?: string;
  recordedAt?: string;
}

/** One Meralco service. Meter Type is supplied by Meralco, never by the client. */
export interface Household {
  sin: string;
  masked_address: string;
  meter_type: "traditional" | "smart";
  changes?: HouseholdChange[];
}
