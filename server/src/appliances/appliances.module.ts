import { Module } from "@nestjs/common";
import { BillsModule } from "../bills/bills.module.js";
import { APPLIANCE_REPOSITORY } from "../common/injection-tokens.js";
import { HouseholdsModule } from "../households/households.module.js";
import { RateSchedulesModule } from "../rate-schedules/rate-schedules.module.js";
import { WeatherModule } from "../weather/weather.module.js";
import { ApplianceCatalogController } from "./appliance-catalog.controller.js";
import { AppliancesController } from "./appliances.controller.js";
import { AppliancesService } from "./appliances.service.js";
import { InMemoryApplianceRepository } from "./in-memory-appliance.repository.js";
import { VisionModule } from "../vision/vision.module.js";
import { ApplianceLabelScanService } from "./appliance-label-scan.service.js";
import { SmartMeterModule } from "../smart-meter/smart-meter.module.js";
import { AirconPatternService } from "./aircon-pattern.service.js";

@Module({
  imports: [HouseholdsModule, BillsModule, RateSchedulesModule, WeatherModule, VisionModule, SmartMeterModule],
  controllers: [ApplianceCatalogController, AppliancesController],
  exports: [AppliancesService, AirconPatternService],
  providers: [AppliancesService, ApplianceLabelScanService, AirconPatternService, { provide: APPLIANCE_REPOSITORY, useFactory: () => new InMemoryApplianceRepository() }],
})
export class AppliancesModule {}
