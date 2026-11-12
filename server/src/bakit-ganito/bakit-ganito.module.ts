import { Body, Controller, Get, Header, HttpCode, Module, Param, Post, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { BakitGanitoDto } from "../bills/bill.dto.js";
import { BillsModule } from "../bills/bills.module.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";
import { HouseholdsModule } from "../households/households.module.js";
import { RateSchedulesModule } from "../rate-schedules/rate-schedules.module.js";
import { BakitGanitoService } from "./bakit-ganito.service.js";

@Controller()
export class BakitGanitoController {
  constructor(private readonly service: BakitGanitoService) {}

  /** "Bakit ganito?" from two typed Bills. */
  @Post("bakit-ganito")
  @HttpCode(200)
  fromTypedBills(@Body() body: BakitGanitoDto) {
    return this.service.decode(body.before, body.now);
  }

  /** "Bakit ganito?" from a Household's two latest Bills in its Bill source. */
  @Get("households/:sin/bakit-ganito")
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard, HouseholdAccessGuard)
  forHousehold(@Param("sin") sin: string) {
    return this.service.forHousehold(sin);
  }
}

@Module({
  imports: [RateSchedulesModule, BillsModule, HouseholdsModule],
  controllers: [BakitGanitoController],
  providers: [BakitGanitoService],
})
export class BakitGanitoModule {}
