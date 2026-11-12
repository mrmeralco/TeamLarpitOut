import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, GoneException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ACCOUNT_REPOSITORY, AUTH_CLOCK, NOTIFIER, SIGN_IN_CODE_GENERATOR } from "../common/injection-tokens.js";
import type { AccountRepository } from "./account.repository.js";
import type { AuthClock } from "./auth.service.js";
import type { Notifier, OtpChannel, SignInCodeGenerator } from "./notifier.interface.js";
import { hashPassword, PASSWORD_RULE } from "./password.js";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_WRONG_CODES = 5;
export const LINK_TTL_MS = 24 * 60 * 60 * 1000;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const randomSignInCode: SignInCodeGenerator = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
/** "+63 917 ••• 4567": enough to recognise, not enough to reuse. */
export const maskPhone = (phone: string) => `+63 ${phone.slice(3, 6)} ••• ${phone.slice(-4)}`;
export const maskEmail = (email: string) => {
  const [user, domain] = email.split("@");
  return `${user!.slice(0, 1)}${"•".repeat(Math.max(1, user!.length - 2))}${user!.length > 1 ? user!.slice(-1) : ""}@${domain}`;
};

const WRONG_CODE = "The code is wrong or expired. Ask for a new code.";
const BAD_LINK = "This link is invalid or has already been used. Sign up again to get a new link.";

interface PendingCode { hash: Buffer; expiresAt: number; wrong: number }
interface PendingLink { email: string; expiresAt: number }

/**
 * Sign-up like My Meralco: email + mobile number → one-time code (SMS, or email) →
 * email verification link → the person creates their own password.
 * Codes and link tokens are stored only as hashes and work once.
 */
@Injectable()
export class SignupService {
  private readonly codes = new Map<string, PendingCode>();
  private readonly links = new Map<string, PendingLink>();
  private readonly key = randomBytes(32);

  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    @Inject(SIGN_IN_CODE_GENERATOR) private readonly generate: SignInCodeGenerator,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  private codeHash(email: string, code: string) {
    return createHmac("sha256", this.key).update(`${email}\n${code}`).digest();
  }
  private linkHash(token: string) {
    return createHash("sha256").update(token).digest("base64url");
  }

  private async sendCode(email: string, phone: string, channel: OtpChannel) {
    const now = this.clock.now();
    for (const [k, v] of this.codes) if (v.expiresAt <= now) this.codes.delete(k);
    const code = this.generate();
    this.codes.set(email, { hash: this.codeHash(email, code), expiresAt: now + OTP_TTL_MS, wrong: 0 });
    await this.notifier.sendOtp(channel, channel === "sms" ? phone : email, code);
    return { channel, sentTo: channel === "sms" ? maskPhone(phone) : maskEmail(email), expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  /** Step 1: email + mobile number. A finished account is told to sign in instead. */
  async start(rawEmail: string, phone: string, rawName: string) {
    const email = normalizeEmail(rawEmail);
    const existing = await this.accounts.find(email);
    if (existing?.passwordHash) {
      throw new ConflictException({ error: "An account with this email already exists. Sign in instead.", reason: "accountExists" });
    }
    const name = rawName.trim().replace(/\s+/g, " ");
    await this.accounts.save({ email, phone, name, phoneVerified: false, passwordHash: null, createdAt: existing?.createdAt ?? new Date(this.clock.now()).toISOString() });
    return this.sendCode(email, phone, "sms");
  }

  /** "Resend code" or "Send the code by email instead". */
  async resend(rawEmail: string, channel: OtpChannel) {
    const email = normalizeEmail(rawEmail);
    const account = await this.accounts.find(email);
    if (!account || account.passwordHash) throw new BadRequestException({ error: "Start sign-up again." });
    return this.sendCode(email, account.phone, channel);
  }

  /** Step 2: the code confirms the mobile number, then the verification link goes to the email. */
  async verifyCode(rawEmail: string, code: string) {
    const email = normalizeEmail(rawEmail);
    const entry = this.codes.get(email);
    if (!entry || entry.expiresAt <= this.clock.now() || entry.wrong >= MAX_WRONG_CODES) throw new UnauthorizedException({ error: WRONG_CODE });
    if (!timingSafeEqual(entry.hash, this.codeHash(email, code))) {
      entry.wrong++;
      throw new UnauthorizedException({ error: WRONG_CODE });
    }
    this.codes.delete(email);
    const account = (await this.accounts.find(email))!;
    await this.accounts.save({ ...account, phoneVerified: true });
    const token = randomBytes(32).toString("base64url");
    for (const [k, v] of this.links) if (v.email === email || v.expiresAt <= this.clock.now()) this.links.delete(k);
    this.links.set(this.linkHash(token), { email, expiresAt: this.clock.now() + LINK_TTL_MS });
    const link = `${(process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "")}/#/create-password/${token}`;
    await this.notifier.sendVerificationLink(email, link);
    return {
      sentTo: email,
      expiresInHours: LINK_TTL_MS / 3_600_000,
      // Demo/test mode only: lets "Open Gmail" stand in for tapping the emailed link.
      ...(process.env.AUTH_FIXED_CODE ? { demoLink: `/#/create-password/${token}` } : {}),
    };
  }

  private pending(token: string): PendingLink {
    const entry = this.links.get(this.linkHash(token));
    if (!entry) throw new GoneException({ error: BAD_LINK, reason: "invalidLink" });
    if (entry.expiresAt <= this.clock.now()) {
      this.links.delete(this.linkHash(token));
      throw new GoneException({ error: "This link has expired. Sign up again to get a new link.", reason: "expiredLink" });
    }
    return entry;
  }

  /** Opening the link: which email it is for (shown on Create password). */
  checkLink(token: string) {
    return { email: this.pending(token).email };
  }

  /** Step 3: the person creates their own password; the link then stops working. Returns the email. */
  async createPassword(token: string, password: string): Promise<string> {
    if (!PASSWORD_RULE.test(password)) {
      throw new BadRequestException({ error: "Use at least 8 characters with a letter and a number.", reason: "weakPassword" });
    }
    const { email } = this.pending(token);
    const account = await this.accounts.find(email);
    if (!account || !account.phoneVerified) throw new GoneException({ error: BAD_LINK, reason: "invalidLink" });
    await this.accounts.save({ ...account, passwordHash: await hashPassword(password) });
    this.links.delete(this.linkHash(token));
    return email;
  }
}
