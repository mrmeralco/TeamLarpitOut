import { Body, Controller, Get, Header, Module, Param, Put, UseGuards } from "@nestjs/common";
import { AppliancesModule } from "../appliances/appliances.module.js";
import { SessionGuard } from "../auth/session.guard.js";
import { SETUP_REPOSITORY } from "../common/injection-tokens.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";
import { HouseholdsModule } from "../households/households.module.js";
import { PointsModule } from "../points/points.module.js";
import { SetupHouseholdDto, SetupRoutineDto } from "./dto/setup.dto.js";
import { InMemorySetupRepository } from "./setup-repository.js";
import { SetupService } from "./setup.service.js";

@Controller("households/:sin/setup")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  status(@Param("sin") sin: string) {
    return this.setup.status(sin);
  }

  @Put("household")
  @Header("Cache-Control", "no-store")
  household(@Param("sin") sin: string, @Body() body: SetupHouseholdDto) {
    return this.setup.saveHousehold(sin, body.size);
  }

  @Put("routine")
  @Header("Cache-Control", "no-store")
  routine(@Param("sin") sin: string, @Body() body: SetupRoutineDto) {
    return this.setup.saveRoutine(sin, body.home, body.aircon);
  }
}

@Module({
  imports: [HouseholdsModule, AppliancesModule, PointsModule],
  controllers: [SetupController],
  providers: [SetupService, { provide: SETUP_REPOSITORY, useFactory: () => new InMemorySetupRepository() }],
  exports: [SetupService],
})
export class SetupModule {}
