import { Body, Controller, Header, HttpCode, Module, Post, Req, UseGuards } from "@nestjs/common";
import { ACCOUNT_REPOSITORY, AUTH_CLOCK, NOTIFIER, SIGN_IN_CODE_GENERATOR } from "../common/injection-tokens.js";
import { InMemoryAccountRepository } from "./account.repository.js";
import { AuthService } from "./auth.service.js";
import { CreatePasswordDto, ResendOtpDto, SignInDto, StartSignupDto, VerificationLinkDto, VerifyOtpDto } from "./dto/signup.dto.js";
import { LogNotifier } from "./notifier.interface.js";
import { SessionGuard, type AuthenticatedRequest } from "./session.guard.js";
import { randomSignInCode, SignupService } from "./signup.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly signup: SignupService) {}

  /** Sign up 1/3: email + mobile number; a one-time code goes to the phone by SMS. */
  @Post("signup")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  start(@Body() body: StartSignupDto) {
    return this.signup.start(body.email, body.phone);
  }

  @Post("signup/resend")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  resend(@Body() body: ResendOtpDto) {
    return this.signup.resend(body.email, body.channel);
  }

  /** Sign up 2/3: the code; the email then receives a verification link. */
  @Post("signup/verify")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  verify(@Body() body: VerifyOtpDto) {
    return this.signup.verifyCode(body.email, body.code);
  }

  @Post("signup/link")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  link(@Body() body: VerificationLinkDto) {
    return this.signup.checkLink(body.token);
  }

  /** Sign up 3/3: from the email link, the person creates a password and is signed in. */
  @Post("signup/password")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async password(@Body() body: CreatePasswordDto) {
    return this.auth.createSession(await this.signup.createPassword(body.token, body.password));
  }

  @Post("signin")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  signIn(@Body() body: SignInDto) {
    return this.auth.signIn(body.email, body.password);
  }

  @Post("logout")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  logout(@Req() request: AuthenticatedRequest) {
    this.auth.logout(request.auth.token);
  }
}

const fixedCode = () => {
  const fixed = process.env.AUTH_FIXED_CODE;
  return fixed && /^\d{6}$/.test(fixed) ? () => fixed : randomSignInCode;
};

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SignupService,
    SessionGuard,
    { provide: AUTH_CLOCK, useValue: { now: () => Date.now() } },
    { provide: NOTIFIER, useFactory: () => new LogNotifier() },
    { provide: SIGN_IN_CODE_GENERATOR, useFactory: fixedCode },
    { provide: ACCOUNT_REPOSITORY, useFactory: () => new InMemoryAccountRepository() },
  ],
  exports: [AuthService, SessionGuard, AUTH_CLOCK],
})
export class AuthModule {}
