import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { buildBillBreakdown } from "../domain/bill-breakdown.js";
import { BillBreakdownRequestDto } from "./dto/bill-breakdown-request.dto.js";

/** "Ano'ng laman ng bill ko?": the Bill's printed lines, grouped and explained. */
@Controller("bills")
export class BillBreakdownController {
  @Post("laman")
  @HttpCode(200)
  breakdown(@Body() body: BillBreakdownRequestDto) {
    return buildBillBreakdown(body.now.chargeLines, body.before?.chargeLines ?? []);
  }
}
