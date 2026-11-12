import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ACCOUNT_REPOSITORY, AUTH_CLOCK, SESSION_REPOSITORY } from "../common/injection-tokens.js";
import type { AccountRepository } from "./account.repository.js";
import { verifyPassword } from "./password.js";
import type { SessionRepository } from "./session.repository.js";
import { normalizeEmail } from "./signup.service.js";

export interface AuthClock { now(): number }
/** A session stays alive while it is used: each use pushes expiry to this far ahead. */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
/** However active, a session ends this long after sign-in. */
export const SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000;
/** Renew at most this often, so ordinary requests don't each write to the store. */
export const SESSION_TOUCH_MS = 60 * 60 * 1000;
export const SIGN_IN_REQUIRED = "Please sign in first.";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A login's stable id. Derived from the email, so the email itself never needs storing. */
export function ownerIdForEmail(email: string): string {
  return "u_" + createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32);
}

@Injectable()
export class AuthService {
  private lastPrune = Number.NEGATIVE_INFINITY;

  constructor(
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  /** Email + password. One answer for an unknown email, an unfinished sign-up and a wrong password. */
  async signIn(rawEmail: string, password: string): Promise<{ token: string }> {
    const email = normalizeEmail(rawEmail);
    const account = await this.accounts.find(email);
    const ok = account?.passwordHash ? await verifyPassword(password, account.passwordHash) : false;
    if (!ok) throw new UnauthorizedException({ error: "The email or password is incorrect." });
    return this.createSession(email);
  }

  async createSession(email: string): Promise<{ token: string }> {
    const now = this.clock.now();
    if (now - this.lastPrune >= SESSION_TOUCH_MS) {
      this.lastPrune = now;
      await this.sessions.deleteExpired(now);
    }
    const token = randomBytes(32).toString("base64url");
    await this.sessions.save(hashToken(token), {
      ownerId: ownerIdForEmail(email),
      createdAt: now,
      touchedAt: now,
      expiresAt: now + Math.min(SESSION_IDLE_MS, SESSION_MAX_MS),
    });
    return { token };
  }

  /** The session's owner. Each use slides the expiry forward, up to SESSION_MAX_MS after sign-in. */
  async authenticate(token: string): Promise<string> {
    const hash = hashToken(token);
    const session = await this.sessions.find(hash);
    const now = this.clock.now();
    if (!session || session.expiresAt <= now) {
      if (session) await this.sessions.delete(hash);
      throw new UnauthorizedException({ error: SIGN_IN_REQUIRED });
    }
    if (now - session.touchedAt >= SESSION_TOUCH_MS) {
      await this.sessions.touch(hash, now, Math.min(now + SESSION_IDLE_MS, session.createdAt + SESSION_MAX_MS));
    }
    return session.ownerId;
  }

  async logout(token: string): Promise<void> {
    await this.sessions.delete(hashToken(token));
  }
}
