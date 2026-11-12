/**
 * Injection tokens for every external source. Production wires the real ones
 * in their modules; the test harness overrides them with fakes.
 */
export const RATE_SCHEDULES = Symbol("RATE_SCHEDULES");
export const BILL_SOURCE = Symbol("BILL_SOURCE");
export const VISION_PROVIDER = Symbol("VISION_PROVIDER");
