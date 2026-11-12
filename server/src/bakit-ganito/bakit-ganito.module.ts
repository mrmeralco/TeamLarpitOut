import { Body, Controller, Get, HttpCode, Module, Param, Post } from "@nestjs/common";
import { BakitGanitoDto } from "../bills/bill.dto.js";
import { BillsModule } from "../bills/bills.module.js";
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
  forHousehold(@Param("sin") sin: string) {
    return this.service.forHousehold(sin);
  }
}

@Module({
  imports: [RateSchedulesModule, BillsModule],
  controllers: [BakitGanitoController],
  providers: [BakitGanitoService],
})
export class BakitGanitoModule {}
