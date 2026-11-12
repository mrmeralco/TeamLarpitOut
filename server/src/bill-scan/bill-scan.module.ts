import { Module } from "@nestjs/common";
import { VisionModule } from "../vision/vision.module.js";
import { BillScanController } from "./bill-scan.controller.js";
import { BillScanService } from "./bill-scan.service.js";

@Module({
  imports: [VisionModule],
  controllers: [BillScanController],
  providers: [BillScanService],
})
export class BillScanModule {}
