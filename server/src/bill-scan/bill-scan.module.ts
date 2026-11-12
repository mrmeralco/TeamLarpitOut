import { HouseholdsModule } from "../households/households.module.js";
import { ScanContextStore } from "../vision/scan-context.store.js";
import { Module } from "@nestjs/common";
import { VisionModule } from "../vision/vision.module.js";
import { BillScanController } from "./bill-scan.controller.js";
import { BillScanService } from "./bill-scan.service.js";

@Module({
  imports: [VisionModule, HouseholdsModule],
  controllers: [BillScanController],
  providers: [BillScanService, ScanContextStore],
})
export class BillScanModule {}
