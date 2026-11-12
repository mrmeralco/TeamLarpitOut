import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { TARGET_CUTS, type TargetCut } from "../../domain/baseline.js";

export class SaveUsagePlanDto {
  @IsIn(TARGET_CUTS as unknown as number[], { message: "Ang bawas ay 5, 10 o 15 porsyento lang." })
  cut: TargetCut;

  @IsArray()
  @ArrayMinSize(1, { message: "Pumili ng 1 hanggang 3 Mission." })
  @ArrayMaxSize(3, { message: "Pumili ng 1 hanggang 3 Mission." })
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
