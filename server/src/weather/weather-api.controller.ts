import { BadGatewayException, BadRequestException, Controller, Get, Header, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import type { Clock } from "../common/clock.js";
import { CLOCK, DAILY_WEATHER_SOURCE, WEATHER_PROVIDER } from "../common/injection-tokens.js";
import { addDays, cddOf, CDD_BASE_C, manilaDate } from "../domain/daily-points.js";
import { shiftPeriod } from "../domain/demo-history.js";
import { HouseholdAccessGuard, type HouseholdRequest } from "../households/household-access.guard.js";
import type { DailyWeatherSource } from "./daily-weather-source.interface.js";
import { DailyWeatherQueryDto, MonthlyWeatherQueryDto } from "./dto/weather-query.dto.js";
import type { WeatherProvider } from "./weather-provider.interface.js";

const MAX_DAYS = 366;
const MAX_MONTHS = 24;
const DEFAULT_DAYS = 30;
const round2 = (x: number) => Math.round(x * 100) / 100;
const dayCount = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
const monthCount = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
};

/** Weather the app uses: daily temperature for a Household's area, and monthly heat (cooling degree days). */
@Controller()
@UseGuards(SessionGuard)
export class WeatherApiController {
  constructor(
    @Inject(DAILY_WEATHER_SOURCE) private readonly daily: DailyWeatherSource,
    @Inject(WEATHER_PROVIDER) private readonly monthly: WeatherProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Daily temperature and CDD for the area of this Household. Defaults to the 30 days up to today. */
  @Get("households/:sin/weather")
  @UseGuards(HouseholdAccessGuard)
  @Header("Cache-Control", "no-store")
  async dailyWeather(@Req() request: HouseholdRequest, @Query() query: DailyWeatherQueryDto) {
    if ((query.from === undefined) !== (query.to === undefined)) {
      throw new BadRequestException({ error: "Give both from and to." });
    }
    const to = query.to ?? addDays(manilaDate(this.clock.now()), 1);
    const from = query.from ?? addDays(to, -DEFAULT_DAYS);
    const days = dayCount(from, to);
    if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
      throw new BadRequestException({ error: `Use from before to, at most ${MAX_DAYS} days apart.` });
    }
    let weather: Awaited<ReturnType<DailyWeatherSource["daily"]>>;
    try {
      weather = await this.daily.daily(request.household.sin, { from, to });
    } catch {
      throw new BadGatewayException({ error: "We couldn't get the weather. Please try again." });
    }
    return {
      sin: request.household.sin,
      timeZone: weather.timeZone,
      range: weather.range,
      available: weather.available,
      coverage: weather.coverage,
      provenance: weather.provenance,
      /** Cooling degree days: how far each day's temperature was above this. */
      cddBaseC: CDD_BASE_C,
      days: weather.days.map((d) => ({ date: d.date, temperatureC: round2(d.temperatureC), cdd: round2(cddOf(d.temperatureC)) })),
    };
  }

  /** Average CDD per day for each billing month in [from, to]; null for a month with no data yet. */
  @Get("weather/monthly")
  @Header("Cache-Control", "no-store")
  async monthlyWeather(@Query() query: MonthlyWeatherQueryDto) {
    const months = monthCount(query.from, query.to);
    if (months < 1 || months > MAX_MONTHS) {
      throw new BadRequestException({ error: `Use from on or before to, at most ${MAX_MONTHS} months.` });
    }
    const periods = Array.from({ length: months }, (_, i) => shiftPeriod(query.from, i));
    const values = await Promise.all(periods.map((p) => this.monthly.getCddPerDay(p).catch(() => null)));
    return {
      /** The same base as the daily CDD. */
      cddBaseC: CDD_BASE_C,
      location: "Manila (one location for every Household for now)",
      months: periods.map((period, i) => ({
        period,
        cddPerDay: values[i] === null ? null : round2(values[i]!),
        /** "observed": Open-Meteo's historical weather; "sample": a demo value while that month can't be reached. */
        source: values[i] === null ? null : (this.monthly.cddSource?.(period) ?? null),
      })),
    };
  }
}
