import { DEMO_SMART_SIN } from "../domain/demo-climate.js";
import type { HouseholdLink } from "../households/household-link.repository.js";
import type { Account } from "./account.repository.js";
import { ownerIdForEmail } from "./auth.service.js";
import { hashPassword } from "./password.js";

/** Public demo password for the test logins below (synthetic accounts; never a real person's). */
export const DEMO_PASSWORD = "eelio-demo-2026";

/** The smart meter sample Household (CAN 3901567213, Quezon City). */
export const DEMO_SMART_HOUSEHOLD = { can: "3901567213", sin: DEMO_SMART_SIN } as const;

/**
 * The two test logins, one per meter type, each holding its own Household:
 * - traditional: the real-Bill Household (Home, Bill History, "Bakit ganito?", Bill Checks);
 * - smart meter: the smart sample Household (meter chart, daily Missions and Points).
 */
export const DEMO_LOGINS = [
  { email: "traditional@example.com", phone: "+639170000001", household: "realBill" },
  { email: "smart-meter@example.com", phone: "+639170000002", household: "smart" },
] as const;

/** Seeding is on unless SEED_DEMO_LOGINS=false. */
export const demoLoginsEnabled = () => process.env.SEED_DEMO_LOGINS !== "false";

export async function demoAccounts(now = new Date()): Promise<Account[]> {
  return Promise.all(DEMO_LOGINS.map(async (l) => ({
    email: l.email,
    phone: l.phone,
    phoneVerified: true,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    createdAt: now.toISOString(),
  })));
}

/**
 * Each test login's active link to its Household. DEMO_OWNER_LINKED=false leaves the traditional
 * login without the real-Bill Household, so linking by scanning the Bill can be shown live.
 */
export function demoLinks(realBill: { can: string; sin: string }, linkRealBill = process.env.DEMO_OWNER_LINKED !== "false"): HouseholdLink[] {
  const target = { realBill, smart: DEMO_SMART_HOUSEHOLD } as const;
  return DEMO_LOGINS.filter((l) => l.household !== "realBill" || linkRealBill).map((l) => ({
    ownerId: ownerIdForEmail(l.email), sin: target[l.household].sin, can: target[l.household].can, status: "active" as const,
  }));
}
