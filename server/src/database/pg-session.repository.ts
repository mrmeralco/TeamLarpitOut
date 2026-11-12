import type { SessionRepository, StoredSession } from "../auth/session.repository.js";
import type { Sql } from "./database.module.js";

/** Sessions in `public.sessions`, keyed by the SHA-256 of the bearer token. */
export class PgSessionRepository implements SessionRepository {
  constructor(private readonly sql: Sql) {}

  async find(tokenHash: string): Promise<StoredSession | null> {
    const [row] = await this.sql<{ owner_id: string; created_at: Date; touched_at: Date; expires_at: Date }[]>`
      select owner_id, created_at, touched_at, expires_at from public.sessions where token_hash = ${tokenHash}`;
    if (!row) return null;
    return {
      ownerId: row.owner_id,
      createdAt: new Date(row.created_at).getTime(),
      touchedAt: new Date(row.touched_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
    };
  }

  async save(tokenHash: string, session: StoredSession): Promise<void> {
    await this.sql`
      insert into public.sessions (token_hash, owner_id, created_at, touched_at, expires_at)
      values (${tokenHash}, ${session.ownerId}, ${new Date(session.createdAt)}, ${new Date(session.touchedAt)}, ${new Date(session.expiresAt)})`;
  }

  async touch(tokenHash: string, touchedAt: number, expiresAt: number): Promise<void> {
    await this.sql`
      update public.sessions set touched_at = ${new Date(touchedAt)}, expires_at = ${new Date(expiresAt)}
      where token_hash = ${tokenHash}`;
  }

  async delete(tokenHash: string): Promise<void> {
    await this.sql`delete from public.sessions where token_hash = ${tokenHash}`;
  }

  async deleteExpired(now: number): Promise<void> {
    await this.sql`delete from public.sessions where expires_at <= ${new Date(now)}`;
  }
}
