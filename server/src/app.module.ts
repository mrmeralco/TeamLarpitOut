import { Module } from "@nestjs/common";
import { AccountLinkingModule } from "./account-linking/account-linking.module.js";
import { AppliancesModule } from "./appliances/appliances.module.js";
import { BillBreakdownModule } from "./bill-breakdown/bill-breakdown.module.js";
import { BillChangeModule } from "./bill-change/bill-change.module.js";
import { BillChecksModule } from "./bill-checks/bill-checks.module.js";
import { BillScanModule } from "./bill-scan/bill-scan.module.js";
import { HealthController } from "./health/health.controller.js";
import { HomeModule } from "./home/home.module.js";
import { HouseholdsModule } from "./households/households.module.js";
import { RateSchedulesModule } from "./rate-schedules/rate-schedules.module.js";
import { RewardsModule } from "./rewards/rewards.module.js";
import { SmartMeterModule } from "./smart-meter/smart-meter.module.js";
import { UsagePlanModule } from "./usage-plan/usage-plan.module.js";

@Module({
  imports: [
    RateSchedulesModule,
    BillChangeModule,
    BillScanModule,
    BillBreakdownModule,
    HouseholdsModule,
    AccountLinkingModule,
    SmartMeterModule,
    AppliancesModule,
    BillChecksModule,
    UsagePlanModule,
    HomeModule,
    RewardsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
