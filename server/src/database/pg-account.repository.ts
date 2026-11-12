import type { Account, AccountRepository } from "../auth/account.repository.js";
import { ownerIdForEmail } from "../auth/auth.service.js";
import type { Sql } from "./database.module.js";

/** Logins in `public.accounts`. Emails arrive already normalized (lowercase, trimmed). */
export class PgAccountRepository implements AccountRepository {
  constructor(private readonly sql: Sql) {}

  async find(email: string): Promise<Account | null> {
    const [row] = await this.sql<{ email: string; phone: string; phone_verified: boolean; password_hash: string | null; created_at: Date }[]>`
      select email, phone, phone_verified, password_hash, created_at from public.accounts where email = ${email}`;
    if (!row) return null;
    return { email: row.email, phone: row.phone, phoneVerified: row.phone_verified, passwordHash: row.password_hash, createdAt: new Date(row.created_at).toISOString() };
  }

  async save(account: Account): Promise<void> {
    await this.sql`
      insert into public.accounts (owner_id, email, phone, phone_verified, password_hash, created_at)
      values (${ownerIdForEmail(account.email)}, ${account.email}, ${account.phone}, ${account.phoneVerified}, ${account.passwordHash}, ${account.createdAt})
      on conflict (owner_id) do update set
        phone = excluded.phone, phone_verified = excluded.phone_verified, password_hash = excluded.password_hash`;
  }
}
