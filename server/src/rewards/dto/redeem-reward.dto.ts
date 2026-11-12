import { IsNotEmpty, IsString } from "class-validator";

export class RedeemRewardDto {
  @IsString({ message: "Dapat string ang rewardId." })
  @IsNotEmpty({ message: "Kailangan ang rewardId para makapag-redeem." })
  rewardId: string;
}
