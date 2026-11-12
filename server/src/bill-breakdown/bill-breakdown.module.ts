import { Module } from "@nestjs/common";
import { BillBreakdownController } from "./bill-breakdown.controller.js";

@Module({ controllers: [BillBreakdownController] })
export class BillBreakdownModule {}
