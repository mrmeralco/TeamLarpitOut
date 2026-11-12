import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import type { DaysOfWeek, EnergyLabelInput, TimeRange } from "../../domain/appliance-usage.js";

export class EnergyLabelDto implements EnergyLabelInput {
  @IsNumber()
  consumptionKwh: number;

  @IsIn(["monthly", "daily"])
  period: "monthly" | "daily";

  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber()
  referenceDays?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber()
  referenceHoursPerDay?: number;

  @Equals(true)
  confirmed: true;
}

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

  // Unlike IsOptional, this rejects explicit null instead of silently removing a label.
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => EnergyLabelDto)
  energyLabel?: EnergyLabelDto;
}

export class SaveAppliancesDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ApplianceDto)
  appliances: ApplianceDto[];
}
