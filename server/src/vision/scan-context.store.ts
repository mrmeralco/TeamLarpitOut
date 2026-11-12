import { randomBytes } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthClock } from "../auth/auth.service.js";
import { AUTH_CLOCK } from "../common/injection-tokens.js";

const TTL_MS = 15 * 60 * 1000;

export interface ScanContext { sin: string | null; can: string | null }

/** Formatting separators are accepted; partial numbers or letters never identify an account. */
export function tenDigits(raw: unknown): string | null {
  const digits = typeof raw === "string" && /^[\d\s-]+$/.test(raw) ? raw.replace(/[\s-]/g, "") : "";
  return /^\d{10}$/.test(digits) ? digits : null;
}
const MAX_CONTEXTS = 1000;

@Injectable()
export class ScanContextStore {
  private readonly contexts = new Map<string, ScanContext & { expiresAt: number }>();
  constructor(@Inject(AUTH_CLOCK) private readonly clock: AuthClock) {}

  create(rawSin: unknown, rawCan: unknown = null): string {
    const now = this.clock.now();
    for (const [key, value] of this.contexts) if (value.expiresAt <= now) this.contexts.delete(key);
    if (this.contexts.size >= MAX_CONTEXTS) this.contexts.delete(this.contexts.keys().next().value!);
    const token = randomBytes(32).toString("base64url");
    this.contexts.set(token, { sin: tenDigits(rawSin), can: tenDigits(rawCan), expiresAt: now + TTL_MS });
    return token;
  }

  context(token: string): ScanContext {
    const value = this.contexts.get(token);
    if (!value || value.expiresAt <= this.clock.now()) {
      this.contexts.delete(token);
      throw new NotFoundException({ error: "Nag-expire o hindi makita ang scan. I-scan ulit ang Bill." });
    }
    return { sin: value.sin, can: value.can };
  }

  sin(token: string): string | null {
    return this.context(token).sin;
  }
}
