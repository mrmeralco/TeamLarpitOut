import type { Household } from "../domain/household.js";

/** The My Meralco seam. Owner IDs stay server-side; a Bill photo grants no ownership. */
export interface MyMeralcoSource {
  login(email: string, password: string): Promise<string | null>;
  households(ownerId: string): Promise<Household[]>;
}

export interface MockMeralcoLogin {
  ownerId: string;
  email: string;
  password: string;
  households: Household[];
}

/** Public demo credentials, not a real My Meralco account. */
const DEMO_LOGINS: MockMeralcoLogin[] = [{
  ownerId: "demo-owner",
  email: "demo@example.com",
  password: "kuryenteko-demo",
  households: [
    { sin: "1234567890", masked_address: "••• Caloocan City", meter_type: "traditional" },
    { sin: "9876543210", masked_address: "••• Quezon City", meter_type: "smart" },
  ],
}];

export function mockMyMeralcoSource(logins: MockMeralcoLogin[] = DEMO_LOGINS): MyMeralcoSource {
  const records = structuredClone(logins);
  return {
    async login(email, password) {
      return records.find((entry) => entry.email === email && entry.password === password)?.ownerId ?? null;
    },
    async households(ownerId) {
      return (records.find((entry) => entry.ownerId === ownerId)?.households ?? []).map((h) => ({
        sin: h.sin, masked_address: h.masked_address, meter_type: h.meter_type,
      }));
    },
  };
}
