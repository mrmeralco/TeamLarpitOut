import { BadGatewayException, BadRequestException, Inject, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { READING_SOURCE } from "../common/injection-tokens.js";
import type { Household } from "../domain/household.js";
import { aggregateReadings, DAY_MS, isHourAligned, METER_TIME_ZONE, type ReadingRange, type UsageReadings } from "../domain/meter-reading.js";
import type { ReadingsQueryDto } from "./dto/readings-query.dto.js";
import type { ReadingSource } from "./reading-source.interface.js";

@Injectable()
export class SmartMeterService {
  constructor(@Inject(READING_SOURCE) private readonly source: ReadingSource) {}

  async readings(household: Household, query: ReadingsQueryDto): Promise<UsageReadings> {
    if (household.meter_type !== "smart") {
      throw new UnprocessableEntityException({ error: "Traditional meters have no interval readings." });
    }
    if ((query.from === undefined) !== (query.to === undefined)) {
      throw new BadRequestException({ error: "Give both from and to." });
    }
    let range: ReadingRange | null = null;
    if (query.from !== undefined && query.to !== undefined) {
      const from = Date.parse(query.from);
      const to = Date.parse(query.to);
      if (!isHourAligned(from) || !isHourAligned(to) || from >= to || to - from > 366 * DAY_MS) {
        throw new BadRequestException({ error: "Use an hour-aligned range of up to 366 days, with from before to." });
      }
      range = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
    }
    try {
      const metadata = await this.source.describe(household.sin);
      if (metadata.available) {
        const start = Date.parse(metadata.available.from);
        const end = Date.parse(metadata.available.to);
        if (!isHourAligned(start) || !isHourAligned(end) || start >= end) throw new Error("Invalid source window");
        if (!range) {
          const duration = query.interval === "hour" ? DAY_MS : query.interval === "day" ? 30 * DAY_MS : 84 * DAY_MS;
          range = { from: new Date(Math.max(start, end - duration)).toISOString(), to: new Date(end).toISOString() };
        }
      }
      const rows = range ? await this.source.readings(household.sin, range) : [];
      return {
        sin: household.sin, interval: query.interval, timeZone: METER_TIME_ZONE,
        range, available: metadata.available, provenance: metadata.provenance,
        readings: range ? aggregateReadings(rows, range, query.interval) : [],
      };
    } catch {
      throw new BadGatewayException({ error: "We couldn't get the smart meter readings. Please try again." });
    }
  }
}
