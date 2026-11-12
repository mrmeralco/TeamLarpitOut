import { Controller, Get, Header, Module, Req, UseGuards } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { MyMeralcoModule } from "../bills/my-meralco.module.js";
import { HouseholdAccessGuard } from "./household-access.guard.js";
import { HouseholdsService } from "./households.service.js";

@Controller("households")
@UseGuards(SessionGuard)
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Req() request: AuthenticatedRequest) {
    return this.households.list(request.auth.ownerId);
  }
}

@Module({
  imports: [AuthModule, MyMeralcoModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService, HouseholdAccessGuard],
  exports: [AuthModule, HouseholdsService, HouseholdAccessGuard],
})
export class HouseholdsModule {}
