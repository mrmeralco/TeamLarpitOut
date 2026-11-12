import { Body, Controller, Get, Header, HttpCode, Module, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import { MyMeralcoModule } from "../bills/my-meralco.module.js";
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
  imports: [AuthModule, MyMeralcoModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService, HouseholdAccessGuard],
  exports: [AuthModule, HouseholdsService, HouseholdAccessGuard],
})
export class HouseholdsModule {}
