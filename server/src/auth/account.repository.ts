import { ownerIdForEmail } from "./auth.service.js";

/** One login. The phone is verified by OTP, the email by its link; a password exists once sign-up is complete. */
export interface Account {
  email: string;
  phone: string;
  /** Full name as typed at sign-up; a scanned Bill must be in this name to be linked. */
  name?: string;
  phoneVerified: boolean;
  passwordHash: string | null;
  createdAt: string;
}

export interface AccountRepository {
  find(email: string): Promise<Account | null>;
  /** The login behind a session's owner id. */
  findByOwner(ownerId: string): Promise<Account | null>;
  save(account: Account): Promise<void>;
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, Account>();
  async find(email: string) { return structuredClone(this.accounts.get(email) ?? null); }
  async findByOwner(ownerId: string) {
    for (const account of this.accounts.values()) if (ownerIdForEmail(account.email) === ownerId) return structuredClone(account);
    return null;
  }
  async save(account: Account) { this.accounts.set(account.email, structuredClone(account)); }
}
