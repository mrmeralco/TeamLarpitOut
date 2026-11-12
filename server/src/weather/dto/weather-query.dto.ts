import { IsOptional, Matches } from "class-validator";

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Half-open [from, to) of Asia/Manila dates; both or neither. */
export class DailyWeatherQueryDto {
  @IsOptional()
  @Matches(DATE, { message: "from must be a date like 2026-11-01." })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: "to must be a date like 2026-11-15." })
  to?: string;
}

/** Inclusive billing months, e.g. from=2026-01&to=2026-11. */
export class MonthlyWeatherQueryDto {
  @Matches(PERIOD, { message: "from must be a billing month like 2026-01." })
  from!: string;

  @Matches(PERIOD, { message: "to must be a billing month like 2026-11." })
  to!: string;
}
