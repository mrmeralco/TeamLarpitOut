/**
 * Injection tokens for every external source. Production wires the real ones
 * in their modules; the test harness overrides them with fakes.
 */
export const RATE_SCHEDULES = Symbol("RATE_SCHEDULES");
export const BILL_SOURCE = Symbol("BILL_SOURCE");
export const VISION_PROVIDER = Symbol("VISION_PROVIDER");
/** Mock Meralco account API, keyed by Customer Account Number. */
export const MERALCO_ACCOUNTS = Symbol("MERALCO_ACCOUNTS");
/** Which login each Household is linked to (pending or active). */
export const HOUSEHOLD_LINKS = Symbol("HOUSEHOLD_LINKS");
/** Delivers email sign-in codes (demo: logs the code). */
export const EMAIL_SENDER = Symbol("EMAIL_SENDER");
/** Makes 6-digit sign-in codes (fixed in test mode). */
export const SIGN_IN_CODE_GENERATOR = Symbol("SIGN_IN_CODE_GENERATOR");
export const WEATHER_PROVIDER = Symbol("WEATHER_PROVIDER");
export const READING_SOURCE = Symbol("READING_SOURCE");
/** Injectable time source for session expiry. */
export const AUTH_CLOCK = Symbol("AUTH_CLOCK");
/** Per-Household appliance storage (in-memory now; database later). */
export const APPLIANCE_REPOSITORY = Symbol("APPLIANCE_REPOSITORY");
/** Per-Household Target and Missions for a billing period (in-memory now; database later). */
export const USAGE_PLAN_REPOSITORY = Symbol("USAGE_PLAN_REPOSITORY");
/** Per-Household typed Mid-month Reading for traditional meters (in-memory now; database later). */
export const MID_MONTH_READING_REPOSITORY = Symbol("MID_MONTH_READING_REPOSITORY");
/** Words computed Missions for the household; never supplies a number. */
export const COACH_PROVIDER = Symbol("COACH_PROVIDER");
/** Per-Household points ledger and verified savings history. */
export const POINTS_REPOSITORY = Symbol("POINTS_REPOSITORY");
/** Outage records from Meralco (used to exclude brownouts from Points). */
export const OUTAGE_SOURCE = Symbol("OUTAGE_SOURCE");
/** Per-Household Household Setup progress (in-memory now; database later). */
export const SETUP_REPOSITORY = Symbol("SETUP_REPOSITORY");
