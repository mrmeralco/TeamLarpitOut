import { randomBytes } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { MyMeralcoSource } from "../sources/myMeralcoSource.js";
import { AUTH_CLOCK, MY_MERALCO_SOURCE } from "../tokens.js";

export interface AuthClock { now(): number }
export const SESSION_TTL_MS = 60 * 60 * 1000;
interface Session { ownerId: string; expiresAt: number }

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, Session>();

  constructor(
    @Inject(MY_MERALCO_SOURCE) private readonly meralco: MyMeralcoSource,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  async login(email: string, password: string) {
    const ownerId = await this.meralco.login(email, password);
    if (ownerId === null) throw new UnauthorizedException({ error: "Hindi tama ang email o password." });
    const households = await this.meralco.households(ownerId);
    const now = this.clock.now();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, { ownerId, expiresAt: now + SESSION_TTL_MS });
    return { token, households };
  }

  authenticate(token: string): string {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= this.clock.now()) {
      this.sessions.delete(token);
      throw new UnauthorizedException({ error: "Mag-login muna gamit ang My Meralco." });
    }
    return session.ownerId;
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }
}
