import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { BillChangeService } from "./bill-change.service.js";
import { BillChangeRequestDto } from "./dto/bill-change-request.dto.js";

/** "Bakit ganito?": why the Bill changed. */
@Controller()
export class BillChangeController {
  constructor(private readonly billChange: BillChangeService) {}

  /** From two typed or scanned-and-confirmed Bills. */
  @Post("bakit-ganito")
  @HttpCode(200)
  fromBills(@Body() body: BillChangeRequestDto) {
    return this.billChange.explain(body.before, body.now);
  }

  /** From a Household's two latest Bills in its Bill source. */
  @Get("households/:sin/bakit-ganito")
  forHousehold(@Param("sin") sin: string) {
    return this.billChange.explainForHousehold(sin);
  }
}
