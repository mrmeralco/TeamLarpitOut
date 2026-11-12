import { Type } from "class-transformer";
import { IsInt, IsObject, Max, Min, ValidateIf, ValidateNested } from "class-validator";
import { EnergyLabelDto } from "./save-appliances.dto.js";

/** Current unsaved aircon rating; routine and derived kW are never trusted inputs. */
export class AirconPatternRequestDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  answers?: Record<string, string>;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => EnergyLabelDto)
  energyLabel?: EnergyLabelDto;
}
