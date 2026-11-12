import { Body, Controller, Get, Header, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { BillChangeService } from "./bill-change.service.js";
import { BillChangeRequestDto } from "./dto/bill-change-request.dto.js";

import { SessionGuard } from "../auth/session.guard.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";

/** "Why this bill?": why the Bill changed. */
@Controller()
export class BillChangeController {
  constructor(private readonly billChange: BillChangeService) {}

  /** From two typed or scanned-and-confirmed Bills. */
  @Post("bakit-ganito")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  fromBills(@Body() body: BillChangeRequestDto) {
    return this.billChange.explainWithFallback(body.before, body.now);
  }

  /** From a Household's two latest Bills in its Bill source. */
  @Get("households/:sin/bakit-ganito")
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard, HouseholdAccessGuard)
  forHousehold(@Param("sin") sin: string) {
    return this.billChange.explainForHousehold(sin);
  }
}
