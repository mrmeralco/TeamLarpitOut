import { IsNumber, IsOptional, IsPositive, IsString, Max, Min } from "class-validator";

export class SaveMidMonthReadingDto {
  @IsNumber()
  @IsPositive()
  reading: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  elapsedDays?: number;

  @IsOptional()
  @IsString()
  readingDate?: string;
}
