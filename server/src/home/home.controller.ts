import { Controller, Get, Header, Param, Req, UseGuards } from "@nestjs/common";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";
import { HomeService } from "./home.service.js";

@Controller("households/:sin/home")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  summary(@Req() request: AuthenticatedRequest, @Param("sin") sin: string) {
    return this.home.summary(request.auth.ownerId, sin);
  }
}
