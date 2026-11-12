import { IsIn, IsISO8601, IsOptional, Matches } from "class-validator";
import type { ReadingInterval } from "../../domain/meter-reading.js";

const OFFSET_HOUR = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):00:00(?:\.000)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export class ReadingsQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(OFFSET_HOUR)
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(OFFSET_HOUR)
  to?: string;

  @IsIn(["hour", "day", "week"])
  interval: ReadingInterval = "day";
}
