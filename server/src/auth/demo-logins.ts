import type { HouseholdLink } from "../households/household-link.repository.js";
import type { Account } from "./account.repository.js";
import { ownerIdForEmail } from "./auth.service.js";
import { hashPassword } from "./password.js";

/** Public demo password for the test logins below (synthetic accounts; never a real person's). */
export const DEMO_PASSWORD = "eelio-demo-2026";

/**
 * Test logins for the real-Bill Household:
 * - the owner, already linked: Home, Bill History and "Bakit ganito?" (Aug vs Sep 2026) right away;
 * - a new user: scan the Bill → found → "Yes, explain my bill" links it;
 * - another user: scanning the same Bill → ownedByAnother (while the owner holds it).
 */
export const DEMO_LOGINS = [
  { email: "bill-owner@example.com", phone: "+639170000001", ownsRealBill: true },
  { email: "new-user@example.com", phone: "+639170000002", ownsRealBill: false },
  { email: "other-user@example.com", phone: "+639170000003", ownsRealBill: false },
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
 * The owner's active link to the real-Bill Household. DEMO_OWNER_LINKED=false leaves it unlinked,
 * so linking by scanning the Bill can be shown live.
 */
export function demoLinks(realBill: { can: string; sin: string }, linked = process.env.DEMO_OWNER_LINKED !== "false"): HouseholdLink[] {
  if (!linked) return [];
  return DEMO_LOGINS.filter((l) => l.ownsRealBill).map((l) => ({
    ownerId: ownerIdForEmail(l.email), sin: realBill.sin, can: realBill.can, status: "active" as const,
  }));
}
