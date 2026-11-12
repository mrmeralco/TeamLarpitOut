import { Body, Controller, HttpCode, Module, Post } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsObject, IsOptional, ValidateNested } from "class-validator";
import { ChargeLineDto } from "../bills/bill.dto.js";
import { laman } from "../domain/laman.js";

class PrintedLinesDto {
  @IsArray()
  @ArrayNotEmpty({ message: "Walang charge line. I-type o i-scan ang mga linya ng Bill." })
  @ValidateNested({ each: true })
  @Type(() => ChargeLineDto)
  chargeLines: ChargeLineDto[];
}

class PreviousLinesDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChargeLineDto)
  chargeLines?: ChargeLineDto[];
}

export class LamanDto {
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

@Controller("bills")
export class LamanController {
  /** "Ano'ng laman ng bill ko?": the Bill's printed lines, grouped and explained. Accepts whole Bills. */
  @Post("laman")
  @HttpCode(200)
  laman(@Body() body: LamanDto) {
    return laman(body.now.chargeLines, body.before?.chargeLines ?? []);
  }
}

@Module({ controllers: [LamanController] })
export class LamanModule {}
