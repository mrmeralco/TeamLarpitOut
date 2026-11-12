import { Module } from "@nestjs/common";
import { BillsModule } from "../bills/bills.module.js";
import { HouseholdsModule } from "../households/households.module.js";
import { RateSchedulesModule } from "../rate-schedules/rate-schedules.module.js";
import { BillChecksController } from "./bill-checks.controller.js";
import { BillChecksService } from "./bill-checks.service.js";

@Module({
  imports: [RateSchedulesModule, BillsModule, HouseholdsModule],
  controllers: [BillChecksController],
  providers: [BillChecksService],
  exports: [BillChecksService],
})
export class BillChecksModule {}
