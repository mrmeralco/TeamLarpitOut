import { randomBytes } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthClock } from "../auth/auth.service.js";
import type { Bill } from "../domain/bill.js";
import { AUTH_CLOCK } from "../common/injection-tokens.js";

const TTL_MS = 15 * 60 * 1000;

/**
 * What a scan proved: the full CAN printed on the Bill (null when it was not readable), and the
 * Bill as read. The Bill is used only in demo mode, as the latest Bill of a demo Household.
 */
export interface ScanContext { can: string | null; bill: Partial<Bill> }

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

  create(rawCan: unknown, bill: Partial<Bill> = {}): string {
    const now = this.clock.now();
    for (const [key, value] of this.contexts) if (value.expiresAt <= now) this.contexts.delete(key);
    if (this.contexts.size >= MAX_CONTEXTS) this.contexts.delete(this.contexts.keys().next().value!);
    const token = randomBytes(32).toString("base64url");
    this.contexts.set(token, { can: tenDigits(rawCan), bill: structuredClone(bill), expiresAt: now + TTL_MS });
    return token;
  }

  context(token: string): ScanContext {
    const value = this.contexts.get(token);
    if (!value || value.expiresAt <= this.clock.now()) {
      this.contexts.delete(token);
      throw new NotFoundException({ error: "The scan expired or was not found. Please scan the Bill again." });
    }
    return { can: value.can, bill: structuredClone(value.bill) };
  }
}
