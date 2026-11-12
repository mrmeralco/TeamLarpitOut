import type { WeatherProvider } from "./weather-provider.interface.js";

/** In-memory fake weather provider for tests. */
export class FakeWeatherProvider implements WeatherProvider {
  private readonly cddMap: Map<string, number>;

  constructor(initial: Record<string, number> | Map<string, number> = {}) {
    this.cddMap = initial instanceof Map ? new Map(initial) : new Map(Object.entries(initial));
  }

  setCdd(period: string, cddPerDay: number) {
    this.cddMap.set(period, cddPerDay);
  }

  async getCddPerDay(period: string): Promise<number | null> {
    const val = this.cddMap.get(period);
    return val !== undefined ? val : null;
  }
}
