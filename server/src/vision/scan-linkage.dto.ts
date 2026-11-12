import { Matches } from "class-validator";

export class ScanLinkageDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  scanToken: string;
}
