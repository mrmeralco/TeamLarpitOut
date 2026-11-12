import { Controller, Get, Header, Query, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { HouseholdAccessGuard, type HouseholdRequest } from "../households/household-access.guard.js";
import { ReadingsQueryDto } from "./dto/readings-query.dto.js";
import { SmartMeterService } from "./smart-meter.service.js";

@Controller("households")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class SmartMeterController {
  constructor(private readonly meter: SmartMeterService) {}

  @Get(":sin/readings")
  @Header("Cache-Control", "no-store")
  readings(@Req() request: HouseholdRequest, @Query() query: ReadingsQueryDto) {
    return this.meter.readings(request.household, query);
  }
}
