import { Logger } from "@nestjs/common";

/** Delivers a sign-in code. Production would send an email; tests capture codes. */
export interface EmailSender {
  sendSignInCode(email: string, code: string): Promise<void>;
}

/**
 * Demo sender: logs the code only. The email address and anything else about
 * the person stay out of the log.
 */
export class LogEmailSender implements EmailSender {
  constructor(private readonly log: (message: string) => void = (m) => new Logger("SignInCode").log(m)) {}

  async sendSignInCode(_email: string, code: string): Promise<void> {
    this.log(`Sign-in code: ${code}`);
  }
}

/** Makes a 6-digit code. `AUTH_FIXED_CODE` (test/demo mode) makes every code that value. */
export type SignInCodeGenerator = () => string;
