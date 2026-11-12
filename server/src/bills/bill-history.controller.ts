import { BadGatewayException, Controller, Get, Header, Inject, Param, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";
import type { BillSource } from "../bills/bill-source.js";
import { BILL_SOURCE } from "../common/injection-tokens.js";

@Controller("households")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class BillHistoryController {
  constructor(@Inject(BILL_SOURCE) private readonly source: BillSource) {}

  @Get(":sin/bills")
  @Header("Cache-Control", "no-store")
  async history(@Param("sin") sin: string) {
    try {
      return (await this.source.bills(sin)).slice().sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
    } catch {
      throw new BadGatewayException({ error: "We couldn't get the Bill History. Please try again." });
    }
  }
}
