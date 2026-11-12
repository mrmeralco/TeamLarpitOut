import { HouseholdsModule } from "../households/households.module.js";
import { Module } from "@nestjs/common";
import { BillsModule } from "../bills/bills.module.js";
import { RateSchedulesModule } from "../rate-schedules/rate-schedules.module.js";
import { WeatherModule } from "../weather/weather.module.js";
import { BillChangeController } from "./bill-change.controller.js";
import { BillChangeService } from "./bill-change.service.js";

@Module({
  imports: [RateSchedulesModule, BillsModule, HouseholdsModule, WeatherModule],
  controllers: [BillChangeController],
  providers: [BillChangeService],
})
export class BillChangeModule {}
