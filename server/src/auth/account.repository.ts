/** One login. The phone is verified by OTP, the email by its link; a password exists once sign-up is complete. */
export interface Account {
  email: string;
  phone: string;
  phoneVerified: boolean;
  passwordHash: string | null;
  createdAt: string;
}

export interface AccountRepository {
  find(email: string): Promise<Account | null>;
  save(account: Account): Promise<void>;
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, Account>();
  async find(email: string) { return structuredClone(this.accounts.get(email) ?? null); }
  async save(account: Account) { this.accounts.set(account.email, structuredClone(account)); }
}
