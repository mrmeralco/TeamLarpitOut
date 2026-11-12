import { Body, Controller, Get, Header, Param, Put, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";
import { AppliancesService } from "./appliances.service.js";
import { SaveAppliancesDto } from "./dto/save-appliances.dto.js";

/** A Household's appliances and "Saan napupunta?". Owner only. */
@Controller("households/:sin/appliances")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class AppliancesController {
  constructor(private readonly appliances: AppliancesService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Param("sin") sin: string) {
    return this.appliances.list(sin);
  }

  @Put()
  @Header("Cache-Control", "no-store")
  save(@Param("sin") sin: string, @Body() body: SaveAppliancesDto) {
    return this.appliances.save(sin, body.appliances);
  }

  @Get("breakdown")
  @Header("Cache-Control", "no-store")
  breakdown(@Param("sin") sin: string) {
    return this.appliances.breakdown(sin);
  }
}
