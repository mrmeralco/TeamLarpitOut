import type { WeatherForecastInfo, WeatherProvider } from "./weather-provider.interface.js";

/** In-memory fake weather provider for tests. */
export class FakeWeatherProvider implements WeatherProvider {
  private readonly cddMap: Map<string, number>;
  private readonly forecastMap = new Map<string, WeatherForecastInfo>();

  constructor(
    initial: Record<string, number> | Map<string, number> = {},
    forecasts: Record<string, WeatherForecastInfo> | Map<string, WeatherForecastInfo> = {},
  ) {
    this.cddMap = initial instanceof Map ? new Map(initial) : new Map(Object.entries(initial));
    const entries = forecasts instanceof Map ? forecasts : Object.entries(forecasts);
    for (const [k, v] of entries) this.forecastMap.set(k, v);
  }

  setCdd(period: string, cddPerDay: number) {
    this.cddMap.set(period, cddPerDay);
  }

  setForecast(period: string, forecast: WeatherForecastInfo) {
    this.forecastMap.set(period, forecast);
  }

  async getCddPerDay(period: string): Promise<number | null> {
    const val = this.cddMap.get(period);
    return val !== undefined ? val : null;
  }

  async getForecast(period?: string): Promise<WeatherForecastInfo | null> {
    if (period && this.forecastMap.has(period)) {
      return this.forecastMap.get(period)!;
    }
    if (period && this.cddMap.has(period)) {
      return { cddPerDay: this.cddMap.get(period)! };
    }
    if (this.forecastMap.size > 0 && !period) {
      return this.forecastMap.values().next().value ?? null;
    }
    return null;
  }
}
