import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import type { Bill, ChargeLine, PaymentRecord } from "../../domain/bill.js";

export class ChargeLineDto implements ChargeLine {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsNumber()
  rate?: number;
}

export class PaymentRecordDto implements PaymentRecord {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be YYYY-MM-DD" })
  date: string;

  @IsNumber()
  @Min(0)
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
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "billDate must be YYYY-MM-DD" })
  billDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dueDate must be YYYY-MM-DD" })
  dueDate?: string;

  @IsOptional()
  @IsString()
  meterSerialNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  previousReading?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  presentReading?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentRecordDto)
  payments?: PaymentRecordDto[];

  @IsOptional()
  @IsNumber()
  paymentsCredited?: number;

  @IsOptional()
  @IsBoolean()
  estimated?: boolean;

  @IsOptional()
  @IsBoolean()
  lifelineEligible?: boolean;
}
