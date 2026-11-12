import type { Household } from "../domain/household.js";

/** One record in the mock Meralco account API, keyed by Customer Account Number (CAN). */
export interface MeralcoAccount {
  /** Customer Account Number, digits only. */
  can: string;
  /** Internal Household key (Service ID Number). */
  sin: string;
  /** City or area only, never the street address. */
  area: string;
  meter_type: Household["meter_type"];
  /** Demo mode only: made for a scanned Bill whose CAN is not in the mock data; logins may share it. */
  demo?: true;
}

/** The Meralco account seam. A CAN lookup reveals only a masked summary. */
export interface MeralcoAccountSource {
  findByCan(can: string): Promise<MeralcoAccount | null>;
  household(sin: string): Promise<MeralcoAccount | null>;
  /** Demo mode only: adds (or keeps) the account made for a scanned Bill. */
  addDemo?(account: MeralcoAccount): Promise<void>;
}

/** Synthetic demo accounts (not real Meralco customers). */
export const DEMO_ACCOUNTS: MeralcoAccount[] = [
  { can: "3901234482", sin: "1234567890", area: "Caloocan City", meter_type: "traditional" },
  { can: "3901567213", sin: "9876543210", area: "Quezon City", meter_type: "smart" },
];

export const toHousehold = (account: MeralcoAccount): Household => ({
  sin: account.sin,
  masked_address: `••• ${account.area}`,
  meter_type: account.meter_type,
});

export function mockMeralcoAccounts(accounts: MeralcoAccount[] = DEMO_ACCOUNTS): MeralcoAccountSource {
  const records = structuredClone(accounts);
  return {
    async findByCan(can) {
      const found = records.find((a) => a.can === can);
      return found ? structuredClone(found) : null;
    },
    async household(sin) {
      const found = records.find((a) => a.sin === sin);
      return found ? structuredClone(found) : null;
    },
    async addDemo(account) {
      if (!records.some((a) => a.can === account.can || a.sin === account.sin)) records.push({ ...structuredClone(account), demo: true });
    },
  };
}
