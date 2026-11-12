import { Module } from "@nestjs/common";
import { BillChangeModule } from "../bill-change/bill-change.module.js";
import { BillChecksModule } from "../bill-checks/bill-checks.module.js";
import { BillsModule } from "../bills/bills.module.js";
import { HouseholdsModule } from "../households/households.module.js";
import { HomeController } from "./home.controller.js";
import { HomeService } from "./home.service.js";

@Module({
  imports: [HouseholdsModule, BillsModule, BillChecksModule, BillChangeModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
