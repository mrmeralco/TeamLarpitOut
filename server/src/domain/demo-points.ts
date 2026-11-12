/** Spendable Points `db:seed` gives each demo Household, so the Rewards shop can be tried in a demo. */
export const DEMO_BONUS_POINTS = 5000;

/** One grant per Household: re-seeding sets it back to DEMO_BONUS_POINTS instead of adding another. */
export const demoBonusId = (sin: string) => `demo-bonus-${sin}`;
