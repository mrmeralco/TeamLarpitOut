import { IsNotEmpty, IsString } from "class-validator";

export class RedeemRewardDto {
  @IsString({ message: "rewardId must be a string." })
  @IsNotEmpty({ message: "rewardId is required to redeem." })
  rewardId: string;
}
