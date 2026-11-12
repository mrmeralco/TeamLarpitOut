import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { buildBillBreakdown } from "../domain/bill-breakdown.js";
import { BillBreakdownRequestDto } from "./dto/bill-breakdown-request.dto.js";

/** "Ano'ng laman ng bill ko?": the Bill's printed lines, grouped and explained. */
@Controller("bills")
export class BillBreakdownController {
  @Post("laman")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  breakdown(@Body() body: BillBreakdownRequestDto) {
    return buildBillBreakdown(body.now.chargeLines, body.before?.chargeLines ?? []);
  }
}
