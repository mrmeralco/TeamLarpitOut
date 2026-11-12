import { IsOptional, IsString, MinLength } from "class-validator";

export class RecordHouseholdChangeDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  period?: string;
}
