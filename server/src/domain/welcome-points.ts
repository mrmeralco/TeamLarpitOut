/**
 * Welcome Points (ADR-0004): granted once per Household for finishing Household
 * Setup, shown in the balance at once but locked until the first Verified Savings.
 */
export const WELCOME_POINTS = 50;

interface LedgerEntry { source: string; points: number }

/** Verified Savings come from a Bill (traditional) or a smart meter day (ADR-0008). */
export const VERIFIED_SOURCES: readonly string[] = ["bill_verified", "meter_verified"];

/** True once a Bill or a smart meter day has shown Verified Savings. */
export function hasVerifiedSavings(entries: LedgerEntry[]): boolean {
  return entries.some((e) => VERIFIED_SOURCES.includes(e.source) && e.points > 0);
}

/** Points that cannot be spent yet: all Welcome Points until the first Verified Savings. */
export function lockedPoints(entries: LedgerEntry[]): number {
  if (hasVerifiedSavings(entries)) return 0;
  return entries.filter((e) => e.source === "welcome").reduce((s, e) => s + e.points, 0);
}
