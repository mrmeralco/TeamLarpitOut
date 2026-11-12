/**
 * A signed-in session. Stored under the SHA-256 of its bearer token, so the store alone never
 * yields a usable token.
 */
export interface StoredSession {
  ownerId: string;
  /** When the session was created; caps how long sliding renewal can keep it alive. */
  createdAt: number;
  /** Last time the expiry was pushed forward. */
  touchedAt: number;
  expiresAt: number;
}

export interface SessionRepository {
  find(tokenHash: string): Promise<StoredSession | null>;
  save(tokenHash: string, session: StoredSession): Promise<void>;
  touch(tokenHash: string, touchedAt: number, expiresAt: number): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  deleteExpired(now: number): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, StoredSession>();

  async find(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    return session ? { ...session } : null;
  }

  async save(tokenHash: string, session: StoredSession) {
    this.sessions.set(tokenHash, { ...session });
  }

  async touch(tokenHash: string, touchedAt: number, expiresAt: number) {
    const session = this.sessions.get(tokenHash);
    if (session) Object.assign(session, { touchedAt, expiresAt });
  }

  async delete(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async deleteExpired(now: number) {
    for (const [hash, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(hash);
  }
}
