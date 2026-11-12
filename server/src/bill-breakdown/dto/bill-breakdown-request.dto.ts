import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsObject, IsOptional, ValidateNested } from "class-validator";
import { ChargeLineDto } from "../../bills/dto/bill.dto.js";

export class PrintedLinesDto {
  @IsArray()
  @ArrayNotEmpty({ message: "Walang charge line. I-type o i-scan ang mga linya ng Bill." })
  @ValidateNested({ each: true })
  @Type(() => ChargeLineDto)
  chargeLines: ChargeLineDto[];
}

export class PreviousLinesDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChargeLineDto)
  chargeLines?: ChargeLineDto[];
}

/** This month's printed lines, and optionally last month's. Whole Bills are accepted. */
export class BillBreakdownRequestDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PrintedLinesDto)
  now: PrintedLinesDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PreviousLinesDto)
  before?: PreviousLinesDto;
}
