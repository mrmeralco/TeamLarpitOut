import seed from "../data/meralco-demo-seed.json" with { type: "json" };
import type { WeatherProvider } from "./weather-provider.interface.js";

export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly cache = new Map<string, number>();
  private readonly fallbackTable = new Map<string, number>();

  constructor(
    private readonly latitude = 14.5995,
    private readonly longitude = 120.9842,
    private readonly baseTemperature = 22.0,
  ) {
    if (seed?.months && Array.isArray(seed.months)) {
      for (const m of seed.months) {
        if (typeof m.period === "string" && typeof m.cddPerDay === "number") {
          this.fallbackTable.set(m.period, m.cddPerDay);
        }
      }
    }
  }

  async getCddPerDay(period: string): Promise<number | null> {
    if (this.cache.has(period)) return this.cache.get(period)!;

    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startDate = `${period}-01`;
    const endDate = `${period}-${String(lastDay).padStart(2, "0")}`;

    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${this.latitude}&longitude=${this.longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_mean`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as { daily?: { temperature_2m_mean?: number[] } };
        const temps = data.daily?.temperature_2m_mean;
        if (Array.isArray(temps) && temps.length > 0) {
          let sumCdd = 0;
          for (const t of temps) {
            sumCdd += Math.max(0, t - this.baseTemperature);
          }
          const cddPerDay = Math.round((sumCdd / temps.length) * 10) / 10;
          this.cache.set(period, cddPerDay);
          return cddPerDay;
        }
      }
    } catch {
      // Offline, sandboxed, or rate-limited: fallback to seed/historical table
    }

    if (this.fallbackTable.has(period)) {
      const val = this.fallbackTable.get(period)!;
      this.cache.set(period, val);
      return val;
    }

    return null;
  }
}
