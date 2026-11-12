import { DEMO_CLIMATE_DATES, DEMO_SMART_SIN, demoTemperatureC } from "../domain/demo-climate.js";
import { DAY_MS } from "../domain/meter-reading.js";
import {
  inMemoryDailyWeatherSource,
  type DailyTemperature,
  type DailyWeatherRange,
  type DailyWeatherSource,
} from "./daily-weather-source.interface.js";

/** Fixed Dec 2025–Nov 2026 invented temperatures, aligned with MockReadingSource. */
export class MockDailyWeatherProvider implements DailyWeatherSource {
  private readonly source: DailyWeatherSource;

  constructor() {
    const days: DailyTemperature[] = [];
    const to = Date.parse(`${DEMO_CLIMATE_DATES.to}T00:00:00Z`);
    for (let timestamp = Date.parse(`${DEMO_CLIMATE_DATES.from}T00:00:00Z`); timestamp < to; timestamp += DAY_MS) {
      const date = new Date(timestamp).toISOString().slice(0, 10);
      days.push({ date, temperatureC: demoTemperatureC(date) });
    }
    this.source = inMemoryDailyWeatherSource({ [DEMO_SMART_SIN]: days }, {
      kind: "synthetic",
      note: "Fixed Dec 2025–Nov 2026 invented temperatures shared with simulated smart meter readings; not weather observations.",
    });
  }

  daily(sin: string, range: DailyWeatherRange) {
    return this.source.daily(sin, range);
  }
}
