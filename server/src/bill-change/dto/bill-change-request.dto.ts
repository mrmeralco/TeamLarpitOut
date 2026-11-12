import { Type } from "class-transformer";
import { IsObject, ValidateNested } from "class-validator";
import { BillDto } from "../../bills/dto/bill.dto.js";

/** Two consecutive Bills to explain. */
export class BillChangeRequestDto {
  @IsObject()
  @ValidateNested()
  @Type(() => BillDto)
  before: BillDto;

  @IsObject()
  @ValidateNested()
  @Type(() => BillDto)
  now: BillDto;
}
