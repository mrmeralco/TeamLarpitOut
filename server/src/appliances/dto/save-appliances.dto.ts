import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import type { DaysOfWeek, TimeRange } from "../../domain/appliance-usage.js";

export class TimeRangeDto implements TimeRange {
  @IsString()
  start: string;

  @IsString()
  end: string;

  @IsIn(["everyday", "weekdays", "weekends"])
  days: DaysOfWeek;
}

/** One appliance. Answers and routine are checked against the catalog by the service. */
export class ApplianceDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsInt()
  quantity?: number;

  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  timeRanges?: TimeRangeDto[];

  @IsOptional()
  @IsNumber()
  usesPerWeek?: number;
}

export class SaveAppliancesDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ApplianceDto)
  appliances: ApplianceDto[];
}
