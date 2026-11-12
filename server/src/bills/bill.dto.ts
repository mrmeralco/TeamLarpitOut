import { Type } from "class-transformer";
import {
  IsArray,
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
