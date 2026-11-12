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
export const HOUSEHOLD_CHANGES = Symbol("HOUSEHOLD_CHANGES");
/** Delivers sign-up codes (SMS or email) and the email verification link (demo: logs them). */
export const NOTIFIER = Symbol("NOTIFIER");
/** Logins: email, verified mobile number, password hash (in-memory now; database later). */
export const ACCOUNT_REPOSITORY = Symbol("ACCOUNT_REPOSITORY");
/** Signed-in sessions (hashed tokens): Postgres when DATABASE_URL is set, else in memory. */
export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
/** Makes 6-digit one-time codes (fixed in test mode). */
export const SIGN_IN_CODE_GENERATOR = Symbol("SIGN_IN_CODE_GENERATOR");
export const WEATHER_PROVIDER = Symbol("WEATHER_PROVIDER");
/** Daily heat keyed by Household, independent of monthly CDD and forecasts. */
export const DAILY_WEATHER_SOURCE = Symbol("DAILY_WEATHER_SOURCE");
export const READING_SOURCE = Symbol("READING_SOURCE");
/** Injectable time source for session expiry. */
export const AUTH_CLOCK = Symbol("AUTH_CLOCK");
/** Per-Household appliance storage (in-memory now; database later). */
export const APPLIANCE_REPOSITORY = Symbol("APPLIANCE_REPOSITORY");
/** Per-Household Target and Missions for a billing period (in-memory now; database later). */
export const USAGE_PLAN_REPOSITORY = Symbol("USAGE_PLAN_REPOSITORY");
/** Per-Household typed Mid-month Reading for traditional meters (in-memory now; database later). */
export const MISSION_REMINDER_REPOSITORY = Symbol("MISSION_REMINDER_REPOSITORY");
export const MID_MONTH_READING_REPOSITORY = Symbol("MID_MONTH_READING_REPOSITORY");
/** Words computed Missions for the household; never supplies a number. */
export const COACH_PROVIDER = Symbol("COACH_PROVIDER");
/** Answers the charge chat (RAG); its own Gemini key when GEMINI_CHAT_API_KEY is set, else COACH_PROVIDER. */
export const CHAT_COACH_PROVIDER = Symbol("CHAT_COACH_PROVIDER");
/** Per-Household points ledger and verified savings history. */
export const POINTS_REPOSITORY = Symbol("POINTS_REPOSITORY");
/** Outage records from Meralco (used to exclude brownouts from Points). */
export const OUTAGE_SOURCE = Symbol("OUTAGE_SOURCE");
/** Per-Household Household Setup progress (in-memory now; database later). */
export const SETUP_REPOSITORY = Symbol("SETUP_REPOSITORY");
/** The Supabase (Postgres) connection, or null when DATABASE_URL is unset (everything stays in memory). */
export const DATABASE = Symbol("DATABASE");
/** Retrieval over Meralco's public bill guide (the ML service's /rag/search). */
export const KNOWLEDGE_SOURCE = Symbol("KNOWLEDGE_SOURCE");
/** Wall clock for Mission Plans and daily Points (see common/clock.ts). */
export const CLOCK = Symbol("CLOCK");
/** The partner Rewards catalog (`public.rewards`, or the sample list without a database). */
export const REWARDS_CATALOG = Symbol("REWARDS_CATALOG");
