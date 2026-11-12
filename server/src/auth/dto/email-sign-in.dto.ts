import { IsEmail, Matches, MaxLength } from "class-validator";

export class StartEmailSignInDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class VerifyEmailSignInDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Matches(/^\d{6}$/)
  code: string;
}
