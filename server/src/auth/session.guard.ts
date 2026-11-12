import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";

export interface AuthenticatedRequest extends Request {
  auth: { token: string; ownerId: string };
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(request.headers.authorization ?? "")?.[1];
    if (!token) throw new UnauthorizedException({ error: "Mag-login muna gamit ang My Meralco." });
    request.auth = { token, ownerId: this.auth.authenticate(token) };
    return true;
  }
}
