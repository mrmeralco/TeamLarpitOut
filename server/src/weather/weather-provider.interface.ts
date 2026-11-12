/**
 * Weather Provider interface: supplies Cooling Degree Days (CDD) observations
 * per period (YYYY-MM).
 */
export interface WeatherProvider {
  /** Returns CDD per day for the given period (YYYY-MM), or null if not available. */
  getCddPerDay(period: string): Promise<number | null>;
}
