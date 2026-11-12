import { IsInt, IsNumber, IsOptional, Matches, Max, Min } from "class-validator";

export class ConfirmLinkDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  scanToken: string;

  /** Typed from the Bill, only when the scan could not read the CAN. */
  @IsOptional()
  @Matches(/^[\d\s-]{10,20}$/)
  can?: string;

  /** Corrections from "Does this look right?". Used only in demo mode, on the scanned Bill. */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100000)
  kwh?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(62)
  billingDays?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10000000)
  totalAmount?: number;
}
