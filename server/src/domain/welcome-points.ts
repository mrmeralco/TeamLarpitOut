/**
 * Welcome Points (ADR-0004): granted once per Household for finishing Household
 * Setup, shown in the balance at once but locked until the first Verified Savings.
 */
export const WELCOME_POINTS = 100;

interface LedgerEntry { source: string; points: number }

/** Points that cannot be spent yet: all Welcome Points until a Bill shows Verified Savings. */
export function lockedPoints(entries: LedgerEntry[]): number {
  const firstVerified = entries.some((e) => e.source === "bill_verified" && e.points > 0);
  if (firstVerified) return 0;
  return entries.filter((e) => e.source === "welcome").reduce((s, e) => s + e.points, 0);
}
