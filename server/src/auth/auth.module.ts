import { Body, Controller, Header, HttpCode, Module, Post, Req, UseGuards } from "@nestjs/common";
import { AUTH_CLOCK, EMAIL_SENDER, SIGN_IN_CODE_GENERATOR } from "../common/injection-tokens.js";
import { AuthService } from "./auth.service.js";
import { StartEmailSignInDto, VerifyEmailSignInDto } from "./dto/email-sign-in.dto.js";
import { CODE_TTL_MS, EmailCodeService, randomSignInCode } from "./email-code.service.js";
import { LogEmailSender } from "./email-sender.interface.js";
import { SessionGuard, type AuthenticatedRequest } from "./session.guard.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly codes: EmailCodeService) {}

  /** Always the same answer, so it never reveals whether an email has used the app before. */
  @Post("email/start")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  async start(@Body() body: StartEmailSignInDto) {
    await this.codes.start(body.email);
    return { sent: true, expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  @Post("email/verify")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  verify(@Body() body: VerifyEmailSignInDto) {
    return this.auth.createSession(this.codes.verify(body.email, body.code));
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
    EmailCodeService,
    SessionGuard,
    { provide: AUTH_CLOCK, useValue: { now: () => Date.now() } },
    { provide: EMAIL_SENDER, useFactory: () => new LogEmailSender() },
    { provide: SIGN_IN_CODE_GENERATOR, useFactory: fixedCode },
  ],
  exports: [AuthService, SessionGuard, AUTH_CLOCK],
})
export class AuthModule {}
