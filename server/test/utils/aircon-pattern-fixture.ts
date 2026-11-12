import { DAY_MS, HOUR_MS, type HourlyReading } from "../../src/domain/meter-reading.js";

/** Complete 10 AM–10 AM frames; temperatures are independent inputs, not inferred from load. */
export function patternFixture(options: {
  nights?: number;
  temperatures?: number[];
  window?: (night: number) => { start: number; end: number } | null;
  step?: (temperature: number, night: number) => number;
} = {}) {
  const nights = options.nights ?? 14;
  const origin = Date.parse("2026-11-01T00:00:00+08:00");
  const temperatures = Array.from({ length: nights + 1 }, (_, i) => options.temperatures?.[i] ?? 26 + (i % 7) * 0.5);
  const weather = temperatures.map((temperatureC, i) => ({
    date: new Date(origin + i * DAY_MS + 8 * HOUR_MS).toISOString().slice(0, 10), temperatureC,
  }));
  const rows: HourlyReading[] = Array.from({ length: nights * 24 }, (_, i) => {
    const night = Math.floor(i / 24);
    const hour = 10 + i % 24;
    const temperature = temperatures[night + (hour >= 24 ? 1 : 0)]!;
    const window = options.window ? options.window(night) : { start: 22, end: 30 };
    const active = window && hour >= window.start && hour < window.end;
    const step = options.step ? options.step(temperature, night) : 1 + (temperature - 27) * 0.06;
    return { from: new Date(origin + (10 + i) * HOUR_MS).toISOString(), wh: Math.round((0.2 + (active ? step : 0)) * 1000) };
  });
  return { rows, weather, range: { from: rows[0]!.from, to: new Date(origin + (10 + nights * 24) * HOUR_MS).toISOString() } };
}
