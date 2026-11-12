import { randomBytes } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthClock } from "../auth/auth.service.js";
import { AUTH_CLOCK } from "../common/injection-tokens.js";

const TTL_MS = 15 * 60 * 1000;
const MAX_CONTEXTS = 1000;

@Injectable()
export class ScanContextStore {
  private readonly contexts = new Map<string, { sin: string | null; expiresAt: number }>();
  constructor(@Inject(AUTH_CLOCK) private readonly clock: AuthClock) {}

  create(rawSin: unknown): string {
    const now = this.clock.now();
    for (const [key, value] of this.contexts) if (value.expiresAt <= now) this.contexts.delete(key);
    if (this.contexts.size >= MAX_CONTEXTS) this.contexts.delete(this.contexts.keys().next().value!);
    // Formatting separators are accepted; partial IDs or letters never identify a service.
    const digits = typeof rawSin === "string" && /^[\d\s-]+$/.test(rawSin) ? rawSin.replace(/[\s-]/g, "") : "";
    const sin = /^\d{10}$/.test(digits) ? digits : null;
    const token = randomBytes(32).toString("base64url");
    this.contexts.set(token, { sin, expiresAt: now + TTL_MS });
    return token;
  }

  sin(token: string): string | null {
    const value = this.contexts.get(token);
    if (!value || value.expiresAt <= this.clock.now()) {
      this.contexts.delete(token);
      throw new NotFoundException({ error: "Nag-expire o hindi makita ang scan. I-scan ulit para ma-check ang link; puwede pa rin ang quick verdict." });
    }
    return value.sin;
  }
}
