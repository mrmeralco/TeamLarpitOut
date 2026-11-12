import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ScanContextStore } from "./scan-context.store.js";

/** One shared store of short-lived scan references (bill scan writes, account linking reads). */
@Module({
  imports: [AuthModule],
  providers: [ScanContextStore],
  exports: [ScanContextStore],
})
export class ScanContextModule {}
