import { BadRequestException, Body, Controller, Get, Header, HttpCode, Inject, Module, Post, Req, UseGuards } from "@nestjs/common";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard.js";
import type { BillSource } from "../bills/bill-source.js";
import { BillsModule } from "../bills/bills.module.js";
import type { MeralcoAccount } from "../bills/meralco-accounts.js";
import { BILL_SOURCE } from "../common/injection-tokens.js";
import { HouseholdsModule } from "../households/households.module.js";
import { HouseholdsService, maskCan } from "../households/households.service.js";
import { ScanContextModule } from "../vision/scan-context.module.js";
import { ScanContextStore, tenDigits } from "../vision/scan-context.store.js";
import { ConfirmLinkDto, LinkHouseholdDto } from "./dto/link-household.dto.js";

/**
 * Account Linking (ADR-0005): type a CAN → masked summary + pending link;
 * a scanned Bill with the same CAN makes it active.
 */
@Controller("households/link")
@UseGuards(SessionGuard)
export class AccountLinkingController {
  constructor(
    private readonly households: HouseholdsService,
    private readonly contexts: ScanContextStore,
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
  ) {}

  /** Area, Meter Type and how many Bills are on record. Never amounts, kWh or the address. */
  private async summary(account: MeralcoAccount) {
    let periods: string[] = [];
    try {
      periods = (await this.bills.bills(account.sin)).map((b) => b.period).sort().slice(-12);
    } catch {
      periods = [];
    }
    return {
      canMasked: maskCan(account.can),
      area: account.area,
      meterType: account.meter_type,
      billsOnRecord: periods.length,
      firstPeriod: periods[0] ?? null,
      lastPeriod: periods.at(-1) ?? null,
    };
  }

  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async link(@Body() body: LinkHouseholdDto, @Req() request: AuthenticatedRequest) {
    const can = tenDigits(body.can);
    if (can === null) throw new BadRequestException({ error: "Ang CAN ay 10 digit. Tingnan ulit ang Bill." });
    const { account, status } = await this.households.startLink(request.auth.ownerId, can);
    return { status, ...(status === "active" ? { householdSin: account.sin } : {}), ...(await this.summary(account)) };
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async pending(@Req() request: AuthenticatedRequest) {
    const account = await this.households.pendingAccount(request.auth.ownerId);
    return { pending: account ? { status: "pending" as const, ...(await this.summary(account)) } : null };
  }

  /** For a scan that could not read the CAN: the person types it from the Bill they just scanned. */
  @Post("confirm")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async confirm(@Body() body: ConfirmLinkDto, @Req() request: AuthenticatedRequest) {
    const scanned = this.contexts.context(body.scanToken);
    const can = scanned.can ?? (body.can !== undefined ? tenDigits(body.can) : null);
    if (can === null) throw new BadRequestException({ error: "I-type ang 10-digit na CAN na nakasulat sa Bill." });
    return this.households.activateFromScan(request.auth.ownerId, can);
  }
}

@Module({
  imports: [HouseholdsModule, BillsModule, ScanContextModule],
  controllers: [AccountLinkingController],
})
export class AccountLinkingModule {}
