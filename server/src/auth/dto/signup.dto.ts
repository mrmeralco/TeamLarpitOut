import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class StartSignupDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** Philippine mobile number in +63 format, e.g. +639171234567. */
  @Matches(/^\+639\d{9}$/, { message: "Enter a Philippine mobile number, e.g. 917 123 4567." })
  phone: string;
}

export class ResendOtpDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsIn(["sms", "email"])
  channel: "sms" | "email";
}

export class VerifyOtpDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Matches(/^\d{6}$/)
  code: string;
}

export class VerificationLinkDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;
}

export class CreatePasswordDto extends VerificationLinkDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class SignInDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
