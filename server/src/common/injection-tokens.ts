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
