/** Wall clock for Mission Plans and daily Points, kept apart from AUTH_CLOCK so tests can move days without expiring sessions. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
