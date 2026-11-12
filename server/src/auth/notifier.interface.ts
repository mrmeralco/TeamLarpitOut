import { Logger } from "@nestjs/common";

export type OtpChannel = "sms" | "email";

/** Delivers sign-up codes and the email verification link. Production would use SMS and email providers. */
export interface Notifier {
  sendOtp(channel: OtpChannel, destination: string, code: string): Promise<void>;
  sendVerificationLink(email: string, link: string): Promise<void>;
}

/**
 * Demo notifier: logs the code or link only. The email address, phone number and
 * anything else about the person stay out of the log.
 */
export class LogNotifier implements Notifier {
  constructor(private readonly log: (message: string) => void = (m) => new Logger("Notifier").log(m)) {}

  async sendOtp(channel: OtpChannel, _destination: string, code: string): Promise<void> {
    this.log(`${channel === "sms" ? "SMS" : "Email"} one-time code: ${code}`);
  }

  async sendVerificationLink(_email: string, link: string): Promise<void> {
    this.log(`Email verification link: ${link}`);
  }
}

/** Makes 6-digit codes. `AUTH_FIXED_CODE` (test/demo mode) makes every code that value. */
export type SignInCodeGenerator = () => string;
