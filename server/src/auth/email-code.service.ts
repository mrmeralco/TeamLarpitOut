import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AUTH_CLOCK, EMAIL_SENDER, SIGN_IN_CODE_GENERATOR } from "../common/injection-tokens.js";
import type { AuthClock } from "./auth.service.js";
import type { EmailSender, SignInCodeGenerator } from "./email-sender.interface.js";

export const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong codes allowed before the code is locked; a new start issues a fresh one. */
export const MAX_WRONG_CODES = 5;

interface PendingCode { hash: Buffer; expiresAt: number; wrong: number }

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const randomSignInCode: SignInCodeGenerator = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const INVALID = "Mali o expired na ang code. Humingi ng bagong code.";

/** Issues and checks 6-digit email codes. Codes are stored only as keyed hashes and work once. */
@Injectable()
export class EmailCodeService {
  private readonly codes = new Map<string, PendingCode>();
  /** Per-process key so stored hashes are useless outside this server. */
  private readonly key = randomBytes(32);

  constructor(
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(SIGN_IN_CODE_GENERATOR) private readonly generate: SignInCodeGenerator,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  private hash(email: string, code: string): Buffer {
    return createHmac("sha256", this.key).update(`${email}\n${code}`).digest();
  }

  async start(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const now = this.clock.now();
    for (const [key, entry] of this.codes) if (entry.expiresAt <= now) this.codes.delete(key);
    const code = this.generate();
    this.codes.set(email, { hash: this.hash(email, code), expiresAt: now + CODE_TTL_MS, wrong: 0 });
    await this.sender.sendSignInCode(email, code);
  }

  /** Returns the normalized email when the code is right; otherwise 401. */
  verify(rawEmail: string, code: string): string {
    const email = normalizeEmail(rawEmail);
    const entry = this.codes.get(email);
    if (!entry || entry.expiresAt <= this.clock.now() || entry.wrong >= MAX_WRONG_CODES) {
      throw new UnauthorizedException({ error: INVALID });
    }
    if (!timingSafeEqual(entry.hash, this.hash(email, code))) {
      entry.wrong++;
      throw new UnauthorizedException({ error: INVALID });
    }
    this.codes.delete(email);
    return email;
  }
}
