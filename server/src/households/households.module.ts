import { Body, Controller, Get, Header, HttpCode, Module, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { MeralcoAccountsModule } from "../bills/meralco-accounts.module.js";
import { HOUSEHOLD_LINKS } from "../common/injection-tokens.js";
import { InMemoryHouseholdLinkRepository } from "./household-link.repository.js";
import { HouseholdAccessGuard } from "./household-access.guard.js";
import { HouseholdsService } from "./households.service.js";
import { RecordHouseholdChangeDto } from "./dto/record-change.dto.js";

@Controller("households")
@UseGuards(SessionGuard)
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Req() request: AuthenticatedRequest) {
    return this.households.list(request.auth.ownerId);
  }

  @Post(":sin/changes")
  @HttpCode(200)
  @UseGuards(HouseholdAccessGuard)
  @Header("Cache-Control", "no-store")
  async recordChange(
    @Param("sin") sin: string,
    @Body() body: RecordHouseholdChangeDto,
  ) {
    const saved = await this.households.addChange(sin, {
      reason: body.reason,
      period: body.period,
    });
    return { ok: true, change: saved };
  }

  @Get(":sin/changes")
  @UseGuards(HouseholdAccessGuard)
  @Header("Cache-Control", "no-store")
  async getChanges(@Param("sin") sin: string) {
    const changes = await this.households.getChanges(sin);
    return { changes };
  }
}

@Module({
  imports: [AuthModule, MeralcoAccountsModule],
  controllers: [HouseholdsController],
  providers: [
    HouseholdsService,
    HouseholdAccessGuard,
    { provide: HOUSEHOLD_LINKS, useFactory: () => new InMemoryHouseholdLinkRepository() },
  ],
  exports: [AuthModule, MeralcoAccountsModule, HouseholdsService, HouseholdAccessGuard, HOUSEHOLD_LINKS],
})
export class HouseholdsModule {}
