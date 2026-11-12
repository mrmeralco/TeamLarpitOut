import { Module } from "@nestjs/common";
import { BillsModule } from "../bills/bills.module.js";
import { APPLIANCE_REPOSITORY } from "../common/injection-tokens.js";
import { HouseholdsModule } from "../households/households.module.js";
import { RateSchedulesModule } from "../rate-schedules/rate-schedules.module.js";
import { ApplianceCatalogController } from "./appliance-catalog.controller.js";
import { AppliancesController } from "./appliances.controller.js";
import { AppliancesService } from "./appliances.service.js";
import { InMemoryApplianceRepository } from "./in-memory-appliance.repository.js";
import { VisionModule } from "../vision/vision.module.js";
import { ApplianceLabelScanService } from "./appliance-label-scan.service.js";

@Module({
  imports: [HouseholdsModule, BillsModule, RateSchedulesModule, VisionModule],
  controllers: [ApplianceCatalogController, AppliancesController],
  exports: [AppliancesService],
  providers: [AppliancesService, ApplianceLabelScanService, { provide: APPLIANCE_REPOSITORY, useFactory: () => new InMemoryApplianceRepository() }],
})
export class AppliancesModule {}
