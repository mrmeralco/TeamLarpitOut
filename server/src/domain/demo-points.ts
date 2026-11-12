/** No hardcoded demo bonus Points; Points are earned dynamically from kWh saved. */
export const DEMO_BONUS_POINTS = 0;

/** One grant per Household: re-seeding sets it back to DEMO_BONUS_POINTS instead of adding another. */
export const demoBonusId = (sin: string) => `demo-bonus-${sin}`;
