import { Inject, Injectable } from "@nestjs/common";
import type { OutageSource } from "../bills/outage-source.js";
import type { Clock } from "../common/clock.js";
import {
  CLOCK,
  DAILY_WEATHER_SOURCE,
  OUTAGE_SOURCE,
  POINTS_REPOSITORY,
  READING_SOURCE,
  USAGE_PLAN_REPOSITORY,
} from "../common/injection-tokens.js";
import {
  addDays,
  computeDailySavings,
  dailyReference,
  datesBetween,
  manilaDate,
  manilaDayStart,
  REFERENCE_DAYS,
  type DayUsage,
} from "../domain/daily-points.js";
import { aggregateReadings } from "../domain/meter-reading.js";
import type { ReadingSource } from "../smart-meter/reading-source.interface.js";
import type { DailyWeatherSource } from "../weather/daily-weather-source.interface.js";
import type { PointsEntry, PointsRepository } from "./points-repository.interface.js";
import type { UsagePlanRepository } from "./usage-plan-repository.interface.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;

/** Smart meter Households earn Points per complete day after they started Missions (ADR-0008). */
@Injectable()
export class DailyPointsService {
  constructor(
    @Inject(READING_SOURCE) private readonly readings: ReadingSource,
    @Inject(DAILY_WEATHER_SOURCE) private readonly weather: DailyWeatherSource,
    @Inject(POINTS_REPOSITORY) private readonly points: PointsRepository,
    @Inject(OUTAGE_SOURCE) private readonly outages: OutageSource,
    @Inject(USAGE_PLAN_REPOSITORY) private readonly plans: UsagePlanRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Adds one ledger entry for every complete day, from the day after Missions started up to
   * yesterday, that has no entry yet. Today is still running, so it waits for tomorrow. A day
   * missing readings or heat is left for a later visit; a reading or weather failure adds nothing.
   */
  async settle(sin: string, perKwhRate: number): Promise<void> {
    const plan = await this.plans.find(sin);
    if (!plan) return;
    const startDay = manilaDate(Date.parse(plan.startedAt ?? plan.createdAt));
    const first = addDays(startDay, 1);
    const end = manilaDate(this.clock.now());
    if (first >= end) return;

    const settled = new Set(
      (await this.points.getEntries(sin)).filter((e) => e.source === "meter_verified").map((e) => e.day),
    );
    if (datesBetween(first, end).every((date) => settled.has(date))) return;

    const referenceFrom = addDays(startDay, -REFERENCE_DAYS);
    let usage: Map<string, number>;
    let heat: Map<string, number>;
    try {
      const range = { from: manilaDayStart(referenceFrom), to: manilaDayStart(end) };
      const rows = await this.readings.readings(sin, range);
      usage = new Map(
        aggregateReadings(rows, range, "day").filter((b) => !b.partial).map((b) => [manilaDate(Date.parse(b.from)), b.kwh]),
      );
      const daily = await this.weather.daily(sin, { from: referenceFrom, to: end });
      heat = new Map(daily.days.map((d) => [d.date, d.temperatureC]));
    } catch {
      return;
    }

    const complete = (from: string, to: string): DayUsage[] =>
      datesBetween(from, to).flatMap((date) =>
        usage.has(date) && heat.has(date) ? [{ date, kwh: usage.get(date)!, temperatureC: heat.get(date)! }] : [],
      );
    // The day Missions started is left out of both: part of it came before the plan.
    const reference = dailyReference(complete(referenceFrom, startDay));
    if (!reference) return;

    for (const day of complete(first, end)) {
      if (settled.has(day.date)) continue;
      const hasOutage = await this.outages.hasOutageOn(sin, day.date);
      const result = computeDailySavings({ day, reference, perKwhRate, hasOutage });
      const label = dayLabel(day.date);
      const entry: PointsEntry = {
        id: `day-${sin}-${day.date}`,
        sin,
        period: day.date.slice(0, 7),
        day: day.date,
        points: result.points,
        savedPesos: result.savedPesos,
        savedKwh: result.savedKwh,
        baselineKwh: result.baselineKwh,
        actualKwh: result.actualKwh,
        source: "meter_verified",
        hasOutage: result.hasOutage,
        excludedReason: result.excludedReason,
        description: result.hasOutage
          ? `A brownout/outage was recorded on ${label}, so it does not qualify for Points.`
          : result.points > 0
            ? `Verified Savings on ${label} (${result.savedKwh} kWh saved)`
            : `No Verified Savings on ${label}`,
        createdAt: new Date(this.clock.now()).toISOString(),
      };
      await this.points.addEntry(sin, entry);
    }
  }
}
