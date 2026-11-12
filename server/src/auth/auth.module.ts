import { Body, Controller, Header, HttpCode, Module, Post, Req, UseGuards } from "@nestjs/common";
import { MyMeralcoModule } from "../bills/my-meralco.module.js";
import { AUTH_CLOCK } from "../common/injection-tokens.js";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./login.dto.js";
import { SessionGuard, type AuthenticatedRequest } from "./session.guard.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Post("logout")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  logout(@Req() request: AuthenticatedRequest) {
    this.auth.logout(request.auth.token);
  }
}

@Module({
  imports: [MyMeralcoModule],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, { provide: AUTH_CLOCK, useValue: { now: () => Date.now() } }],
  exports: [AuthService, SessionGuard, AUTH_CLOCK],
})
export class AuthModule {}
