import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AUTH_CLOCK } from "../common/injection-tokens.js";
import { normalizeEmail } from "./email-code.service.js";

export interface AuthClock { now(): number }
export const SESSION_TTL_MS = 60 * 60 * 1000;
export const SIGN_IN_REQUIRED = "Mag-sign in muna.";
interface Session { ownerId: string; expiresAt: number }

/** A login's stable id. Derived from the email, so the email itself never needs storing. */
export function ownerIdForEmail(email: string): string {
  return "u_" + createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32);
}

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, Session>();

  constructor(@Inject(AUTH_CLOCK) private readonly clock: AuthClock) {}

  createSession(email: string): { token: string } {
    const now = this.clock.now();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, { ownerId: ownerIdForEmail(email), expiresAt: now + SESSION_TTL_MS });
    return { token };
  }

  authenticate(token: string): string {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= this.clock.now()) {
      this.sessions.delete(token);
      throw new UnauthorizedException({ error: SIGN_IN_REQUIRED });
    }
    return session.ownerId;
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }
}
