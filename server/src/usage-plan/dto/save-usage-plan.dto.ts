import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { TARGET_CUTS, type TargetCut } from "../../domain/baseline.js";

export class SaveUsagePlanDto {
  @IsIn(TARGET_CUTS as unknown as number[], { message: "The goal is a 5% cut." })
  cut: TargetCut;

  @IsArray()
  @ArrayMinSize(1, { message: "Pick 1 to 3 Missions." })
  @ArrayMaxSize(3, { message: "Pick 1 to 3 Missions." })
  @ArrayUnique()
  @IsString({ each: true })
  missionIds: string[];

  /** The aircon's current setting in °C, if known; used by the 25°C Mission. */
  @IsOptional()
  @IsInt()
  @Min(16)
  @Max(30)
  airconSetting?: number;
}
