import { BadGatewayException, BadRequestException, Inject, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { DAILY_WEATHER_SOURCE, READING_SOURCE } from "../common/injection-tokens.js";
import { analyzeAirconPattern } from "../domain/aircon-pattern.js";
import { estimateAppliance, validateApplianceRating, type ApplianceInput } from "../domain/appliance-usage.js";
import type { Household } from "../domain/household.js";
import { aggregateReadings, DAY_MS, HOUR_MS, isHourAligned, METER_TIME_ZONE, type ReadingRange } from "../domain/meter-reading.js";
import type { ReadingSource } from "../smart-meter/reading-source.interface.js";
import type { DailyWeather, DailyWeatherSource } from "../weather/daily-weather-source.interface.js";
import type { AirconPatternRequestDto } from "./dto/aircon-pattern-request.dto.js";

const emptyCoverage = () => ({ completeNights: 0, matchingNights: 0, heatMatchedNights: 0 });
const localDate = (timestamp: number) => new Date(timestamp + 8 * HOUR_MS).toISOString().slice(0, 10);
const displayTime = (value: string) => {
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
};

@Injectable()
export class AirconPatternService {
  constructor(
    @Inject(READING_SOURCE) private readonly readings: ReadingSource,
    @Inject(DAILY_WEATHER_SOURCE) private readonly weather: DailyWeatherSource,
  ) {}

  async propose(household: Household, input: AirconPatternRequestDto) {
    if (household.meter_type !== "smart") {
      throw new UnprocessableEntityException({ error: "Pattern proposals are for smart meters." });
    }
    const candidate: ApplianceInput = { ...input, type: "aircon" };
    const issues = validateApplianceRating(candidate);
    if (issues.length) throw new BadRequestException({ error: "Something is wrong in the aircon details.", issues });
    const estimate = estimateAppliance(candidate);
    const expectedKw = estimate.rating * (candidate.quantity ?? 1);
    let metadata: Awaited<ReturnType<ReadingSource["describe"]>>;
    let range: ReadingRange;
    let rows: Awaited<ReturnType<ReadingSource["readings"]>>;
    try {
      metadata = await this.readings.describe(household.sin);
      if (metadata.available === undefined || metadata.provenance?.kind !== "synthetic"
        || typeof metadata.provenance.note !== "string") throw new Error("Invalid reading metadata");
      if (!metadata.available) {
        return { status: "fallback" as const, canPropose: false as const, fallback: "routine" as const,
          reason: "insufficient-readings", timeZone: METER_TIME_ZONE, range: null,
          expectedKw, ratingSource: estimate.source, coverage: emptyCoverage(),
          provenance: { readings: metadata.provenance, weather: null } };
      }
      const start = Date.parse(metadata.available.from);
      const end = Date.parse(metadata.available.to);
      if (!isHourAligned(start) || !isHourAligned(end) || start >= end) throw new Error("Invalid source window");
      range = { from: new Date(Math.max(start, end - 30 * DAY_MS)).toISOString(), to: new Date(end).toISOString() };
      rows = await this.readings.readings(household.sin, range);
      aggregateReadings(rows, range, "hour");
    } catch {
      throw new BadGatewayException({ error: "We couldn't get the smart meter readings. Try again or enter the routine." });
    }
    const base = { timeZone: METER_TIME_ZONE, range, expectedKw, ratingSource: estimate.source };
    let daily: DailyWeather;
    try {
      const weatherRange = { from: localDate(Date.parse(range.from)), to: localDate(Date.parse(range.to) - 1 + DAY_MS) };
      daily = await this.weather.daily(household.sin, weatherRange);
      const dates = new Set<string>();
      if (daily.timeZone !== METER_TIME_ZONE || daily.provenance.kind !== metadata.provenance.kind) {
        throw new Error("Weather and readings do not share compatible provenance");
      }
      for (const day of daily.days) {
        const timestamp = Date.parse(`${day.date}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isFinite(timestamp)
          || new Date(timestamp).toISOString().slice(0, 10) !== day.date
          || day.date < weatherRange.from || day.date >= weatherRange.to
          || !Number.isFinite(day.temperatureC) || dates.has(day.date)) throw new Error("Invalid daily heat");
        dates.add(day.date);
      }
    } catch {
      const { coverage } = analyzeAirconPattern(rows, range, expectedKw, []);
      return { ...base, status: "fallback" as const, canPropose: false as const, fallback: "routine" as const,
        reason: "weather-unavailable", coverage, provenance: { readings: metadata.provenance, weather: null } };
    }
    const analysis = analyzeAirconPattern(rows, range, expectedKw, daily.days);
    const provenance = { readings: metadata.provenance, weather: daily.provenance };
    if (!analysis.canPropose) return { ...base, ...analysis, status: "fallback" as const, fallback: "routine" as const, provenance };
    const prompt = `There is a large load from ${displayTime(analysis.routine.start)} to ${displayTime(analysis.routine.end)} (about ${analysis.stepKw.toFixed(1)} kW). Is this the aircon?`;
    return { ...base, ...analysis, status: "proposal" as const, prompt, provenance };
  }
}
