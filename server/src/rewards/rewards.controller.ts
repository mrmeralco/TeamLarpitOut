import { Body, Controller, Get, Header, Param, Post, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { HouseholdAccessGuard } from "../households/household-access.guard.js";
import { RedeemRewardDto } from "./dto/redeem-reward.dto.js";
import { RewardsService } from "./rewards.service.js";

/** Partner-funded sample rewards catalog and redemption. Owner only. */
@Controller("households/:sin/rewards")
@UseGuards(SessionGuard, HouseholdAccessGuard)
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  catalog(@Param("sin") sin: string) {
    return this.rewardsService.getCatalog(sin);
  }

  @Post("redeem")
  @Header("Cache-Control", "no-store")
  redeem(@Param("sin") sin: string, @Body() body: RedeemRewardDto) {
    return this.rewardsService.redeem(sin, body.rewardId);
  }
}
