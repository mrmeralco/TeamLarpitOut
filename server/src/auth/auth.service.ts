import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ACCOUNT_REPOSITORY, AUTH_CLOCK } from "../common/injection-tokens.js";
import type { AccountRepository } from "./account.repository.js";
import { verifyPassword } from "./password.js";
import { normalizeEmail } from "./signup.service.js";

export interface AuthClock { now(): number }
export const SESSION_TTL_MS = 60 * 60 * 1000;
export const SIGN_IN_REQUIRED = "Please sign in first.";
interface Session { ownerId: string; expiresAt: number }

/** A login's stable id. Derived from the email, so the email itself never needs storing. */
export function ownerIdForEmail(email: string): string {
  return "u_" + createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32);
}

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, Session>();

  constructor(
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
  ) {}

  /** Email + password. One answer for an unknown email, an unfinished sign-up and a wrong password. */
  async signIn(rawEmail: string, password: string): Promise<{ token: string }> {
    const email = normalizeEmail(rawEmail);
    const account = await this.accounts.find(email);
    const ok = account?.passwordHash ? await verifyPassword(password, account.passwordHash) : false;
    if (!ok) throw new UnauthorizedException({ error: "The email or password is incorrect." });
    return this.createSession(email);
  }

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
