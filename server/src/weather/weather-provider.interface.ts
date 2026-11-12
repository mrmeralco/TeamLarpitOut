export interface WeatherForecastInfo {
  cddPerDay: number;
  heatIndexMax?: number | null;
  isHeatWave?: boolean;
}

/**
 * Weather Provider interface: supplies Cooling Degree Days (CDD) observations
 * per period (YYYY-MM) and weather forecasts.
 */
export interface WeatherProvider {
  /** Returns CDD per day for the given period (YYYY-MM), or null if not available. */
  getCddPerDay(period: string): Promise<number | null>;
  /** Where a period's CDD came from, once getCddPerDay has answered it: observed weather or a sample value. */
  cddSource?(period: string): "observed" | "sample" | null;
  /** Returns 14-day weather forecast and heat index information, or null if not available. */
  getForecast?(period?: string): Promise<WeatherForecastInfo | null>;
}
