import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BillBreakdownController } from "./bill-breakdown.controller.js";

@Module({ imports: [AuthModule], controllers: [BillBreakdownController] })
export class BillBreakdownModule {}
