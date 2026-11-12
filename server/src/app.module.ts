import { HouseholdsModule } from "./households/households.module.js";
import { Module } from "@nestjs/common";
import { BillBreakdownModule } from "./bill-breakdown/bill-breakdown.module.js";
import { BillChangeModule } from "./bill-change/bill-change.module.js";
import { BillScanModule } from "./bill-scan/bill-scan.module.js";
import { HealthController } from "./health/health.controller.js";
import { RateSchedulesModule } from "./rate-schedules/rate-schedules.module.js";

@Module({
  imports: [RateSchedulesModule, BillChangeModule, BillScanModule, BillBreakdownModule, HouseholdsModule],
  controllers: [HealthController],
})
export class AppModule {}
