import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, ValidateNested } from "class-validator";
import { BillDto, PaymentRecordDto } from "../../bills/dto/bill.dto.js";

export class BillChecksRequestDto {
  @ValidateNested()
  @Type(() => BillDto)
  now: BillDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BillDto)
  before?: BillDto;

  @IsOptional()
  @IsNumber()
  tolerancePesos?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentRecordDto)
  payments?: PaymentRecordDto[];
}
