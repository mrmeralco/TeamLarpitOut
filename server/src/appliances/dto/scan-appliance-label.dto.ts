import { IsIn } from "class-validator";

export class ScanApplianceLabelDto {
  @IsIn(["aircon", "refrigerator"])
  type: "aircon" | "refrigerator";
}
