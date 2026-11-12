/** Fixed synthetic climate shared by demo readings and daily weather, never observations. */
export const DEMO_SMART_SIN = "9876543210";
export const DEMO_CLIMATE_DATES = { from: "2025-12-01", to: "2026-12-01" } as const;
const MONTH_TEMPERATURES = [27, 28, 30, 32, 33, 31, 30, 30, 30, 29, 28, 27];

/** Input is a valid Asia/Manila calendar date (YYYY-MM-DD). No rounding before Wh calculation. */
export function demoTemperatureC(localDate: string): number {
  const date = new Date(`${localDate}T00:00:00Z`);
  return MONTH_TEMPERATURES[date.getUTCMonth()]! + Math.sin(date.getUTCDate() * Math.PI / 7);
}
