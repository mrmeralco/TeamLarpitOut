import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import type { Bill, ChargeLine } from "../domain/bill.js";

export class ChargeLineDto implements ChargeLine {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsNumber()
  amount: number;
}

export class BillDto implements Bill {
  @Matches(/^\d{4}-\d{2}$/, { message: "period must be YYYY-MM" })
  period: string;

  @IsNumber()
  @Min(0)
  kwh: number;

  @IsInt()
  @Min(1)
  billingDays: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChargeLineDto)
  chargeLines?: ChargeLineDto[];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dueDate must be YYYY-MM-DD" })
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  previousReading?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  presentReading?: number;

  @IsOptional()
  @IsBoolean()
  estimated?: boolean;

  @IsOptional()
  @IsBoolean()
  lifelineEligible?: boolean;
}

export class BakitGanitoDto {
  @IsObject()
  @ValidateNested()
  @Type(() => BillDto)
  before: BillDto;

  @IsObject()
  @ValidateNested()
  @Type(() => BillDto)
  now: BillDto;
}
