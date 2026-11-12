import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AuthService, SIGN_IN_REQUIRED } from "./auth.service.js";

export interface AuthenticatedRequest extends Request {
  auth: { token: string; ownerId: string };
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new UnauthorizedException({ error: SIGN_IN_REQUIRED });
    request.auth = { token, ownerId: await this.auth.authenticate(token) };
    return true;
  }
}
