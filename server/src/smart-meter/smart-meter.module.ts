import { Module } from "@nestjs/common";
import { READING_SOURCE } from "../common/injection-tokens.js";
import { HouseholdsModule } from "../households/households.module.js";
import { MockReadingSource } from "./mock-reading-source.provider.js";
import { SmartMeterController } from "./smart-meter.controller.js";
import { SmartMeterService } from "./smart-meter.service.js";

@Module({
  imports: [HouseholdsModule],
  controllers: [SmartMeterController],
  providers: [SmartMeterService, { provide: READING_SOURCE, useFactory: () => new MockReadingSource() }],
})
export class SmartMeterModule {}
