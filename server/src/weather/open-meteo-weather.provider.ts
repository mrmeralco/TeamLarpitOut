import seed from "../data/meralco-demo-seed.json" with { type: "json" };
import type { WeatherForecastInfo, WeatherProvider } from "./weather-provider.interface.js";

export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly cache = new Map<string, number>();
  private readonly sources = new Map<string, "observed" | "sample">();
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

  cddSource(period: string): "observed" | "sample" | null {
    return this.sources.get(period) ?? null;
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
          this.sources.set(period, "observed");
          return cddPerDay;
        }
      }
    } catch {
      // Offline, sandboxed, or rate-limited: fallback to seed/historical table
    }

    if (this.fallbackTable.has(period)) {
      const val = this.fallbackTable.get(period)!;
      this.cache.set(period, val);
      this.sources.set(period, "sample");
      return val;
    }

    return null;
  }

  async getForecast(period?: string): Promise<WeatherForecastInfo | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.latitude}&longitude=${this.longitude}&daily=temperature_2m_max,apparent_temperature_max,temperature_2m_mean&forecast_days=14&timezone=Asia%2FManila`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as {
          daily?: {
            temperature_2m_mean?: number[];
            apparent_temperature_max?: number[];
          };
        };
        const temps = data.daily?.temperature_2m_mean ?? [];
        const heatIndices = data.daily?.apparent_temperature_max ?? [];
        let cddPerDay = 4.0;
        if (temps.length > 0) {
          let sumCdd = 0;
          for (const t of temps) sumCdd += Math.max(0, t - this.baseTemperature);
          cddPerDay = Math.round((sumCdd / temps.length) * 10) / 10;
        }
        const maxHeatIndex = heatIndices.length > 0 ? Math.max(...heatIndices) : null;
        const isHeatWave = maxHeatIndex !== null && maxHeatIndex >= 42;
        return {
          cddPerDay,
          heatIndexMax: maxHeatIndex !== null ? Math.round(maxHeatIndex * 10) / 10 : null,
          isHeatWave,
        };
      }
    } catch {
      // Offline, sandboxed, or rate-limited: fallback
    }

    if (period) {
      const cdd = await this.getCddPerDay(period);
      if (cdd !== null) {
        const isHigh = cdd >= 5.5;
        return {
          cddPerDay: cdd,
          heatIndexMax: isHigh ? 43.0 : 38.0,
          isHeatWave: isHigh,
        };
      }
    }
    return null;
  }
}
