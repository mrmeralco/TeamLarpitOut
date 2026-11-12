import { IsOptional, Matches } from "class-validator";

export class ConfirmLinkDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  scanToken: string;

  /** Typed from the Bill, only when the scan could not read the CAN. */
  @IsOptional()
  @Matches(/^[\d\s-]{10,20}$/)
  can?: string;
}
