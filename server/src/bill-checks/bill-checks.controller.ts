import { Body, Controller, Get, Header, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { BillChecksService } from "./bill-checks.service.js";
import { BillChecksRequestDto } from "./dto/bill-checks-request.dto.js";
import { SessionGuard } from "../auth/session.guard.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";

@Controller()
export class BillChecksController {
  constructor(private readonly billChecks: BillChecksService) {}

  /** Run the four Bill Checks from submitted bills. */
  @Post("bills/check")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  checkBills(@Body() body: BillChecksRequestDto) {
    return this.billChecks.check(body.now, body.before, {
      tolerancePesos: body.tolerancePesos,
      payments: body.payments,
      predictedDailyKwh: body.predictedDailyKwh,
      hasHouseholdChange: body.hasHouseholdChange,
    });
  }

  /** Run the four Bill Checks for a Household's latest Bill. */
  @Get("households/:sin/check")
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard, HouseholdAccessGuard)
  checkForHousehold(@Param("sin") sin: string) {
    return this.billChecks.checkForHousehold(sin);
  }
}
