import { IsOptional, Matches } from "class-validator";

const CAN = /^[\d\s-]{10,20}$/;

export class LinkHouseholdDto {
  /** Customer Account Number as printed on the Bill; spaces and dashes allowed. */
  @Matches(CAN)
  can: string;
}

export class ConfirmLinkDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  scanToken: string;

  /** Typed from the Bill, only when the scan could not read the CAN. */
  @IsOptional()
  @Matches(CAN)
  can?: string;
}
