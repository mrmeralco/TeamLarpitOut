import { IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from "class-validator";
import type { AirconPattern, HomePattern } from "../setup-repository.js";

export class SetupHouseholdDto {
  /** How many people live there. Nothing else personal is asked. */
  @IsInt()
  @Min(1)
  @Max(20)
  size: number;
}

export class SetupRoutineDto {
  @IsIn(["allDay", "eveningsWeekends", "daytime"])
  home: HomePattern;

  /** Required when the home has an aircon; null or absent otherwise. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(["sleeping", "afternoonNight", "mostOfDay"])
  aircon?: AirconPattern | null;
}
