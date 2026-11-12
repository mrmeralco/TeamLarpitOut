import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { POINTS_REPOSITORY, REWARDS_CATALOG } from "../common/injection-tokens.js";
import { findReward, type RewardsCatalog } from "../domain/rewards.js";
import type { PointsEntry, PointsRepository } from "../usage-plan/points-repository.interface.js";
import { UsagePlanService } from "../usage-plan/usage-plan.service.js";

@Injectable()
export class RewardsService {
  constructor(
    private readonly usagePlan: UsagePlanService,
    @Inject(POINTS_REPOSITORY) private readonly pointsRepo: PointsRepository,
    @Inject(REWARDS_CATALOG) private readonly rewards: RewardsCatalog,
  ) {}

  async getCatalog(sin: string) {
    const pointsData = await this.usagePlan.getPoints(sin);
    const balance = pointsData.balance;
    const spendable = pointsData.spendable;

    const catalog = (await this.rewards.list()).map((item) => {
      const affordable = spendable >= item.pointsCost;
      const progressPercent = Math.min(100, Math.floor((balance / item.pointsCost) * 100));
      const pointsNeeded = Math.max(0, item.pointsCost - balance);

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        partnerName: item.partnerName,
        pointsCost: item.pointsCost,
        description: item.description,
        tag: item.tag,
        isSampleReward: item.isSampleReward,
        affordable,
        progressPercent,
        pointsNeeded,
      };
    });

    const redemptions = pointsData.history.filter((e) => e.source === "redemption");
    /** Latest Points earned (Bill, smart meter day or Welcome), newest first. */
    const earned = pointsData.history.filter((e) => e.source !== "redemption").slice(0, 10);

    return {
      sin,
      balance,
      lockedPoints: pointsData.lockedPoints,
      spendable,
      tag: "sample rewards" as const,
      disclaimer: "Partner-funded sample rewards. Not a deduction or discount on your Meralco bill.",
      catalog,
      earned,
      redemptions,
    };
  }

  async redeem(sin: string, rewardId: string) {
    const reward = await findReward(this.rewards, rewardId);
    if (!reward) {
      throw new BadRequestException({ error: "Unknown reward." });
    }

    const pointsData = await this.usagePlan.getPoints(sin);
    if (pointsData.balance >= reward.pointsCost && pointsData.spendable < reward.pointsCost) {
      throw new BadRequestException({
        error: `${pointsData.lockedPoints} Welcome Points are locked until your first Verified Savings.`,
        reason: "welcomePointsLocked",
        balance: pointsData.balance,
        lockedPoints: pointsData.lockedPoints,
        pointsCost: reward.pointsCost,
      });
    }
    if (pointsData.balance < reward.pointsCost) {
      throw new BadRequestException({
        error: `Your Points balance (${pointsData.balance} pts) is not enough for ${reward.name} (${reward.pointsCost} pts).`,
        balance: pointsData.balance,
        pointsCost: reward.pointsCost,
        pointsNeeded: reward.pointsCost - pointsData.balance,
      });
    }

    const entry: PointsEntry = {
      id: `redemption-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sin,
      period: "",
      points: -reward.pointsCost,
      savedPesos: 0,
      savedKwh: 0,
      baselineKwh: 0,
      actualKwh: 0,
      source: "redemption",
      hasOutage: false,
      excludedReason: null,
      description: `Redeemed ${reward.name} (-${reward.pointsCost} pts) [sample rewards]`,
      createdAt: new Date().toISOString(),
      rewardId: reward.id,
      rewardName: reward.name,
    };

    await this.pointsRepo.addEntry(sin, entry);
    const newBalance = await this.pointsRepo.getBalance(sin);

    return {
      success: true,
      message: `${reward.name} redeemed!`,
      reward: {
        id: reward.id,
        name: reward.name,
        category: reward.category,
        partnerName: reward.partnerName,
        pointsCost: reward.pointsCost,
        tag: reward.tag,
      },
      redeemedPoints: reward.pointsCost,
      balance: newBalance,
      disclaimer: "Partner-funded sample reward. Not a deduction or discount on your Meralco bill.",
      redemption: entry,
    };
  }
}
