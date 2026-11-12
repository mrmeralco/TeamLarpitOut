/**
 * Injection tokens for every external source. Production wires the real ones
 * in their modules; the test harness overrides them with fakes.
 */
export const RATE_SCHEDULES = Symbol("RATE_SCHEDULES");
export const BILL_SOURCE = Symbol("BILL_SOURCE");
export const VISION_PROVIDER = Symbol("VISION_PROVIDER");
export const MY_MERALCO_SOURCE = Symbol("MY_MERALCO_SOURCE");
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
