import { Global, Inject, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import postgres from "postgres";
import { DATABASE } from "../common/injection-tokens.js";

export type Sql = postgres.Sql;

/**
 * Connects to Supabase's Postgres through the pooler (Supavisor, transaction mode), so prepared
 * statements are off. Add `?sslmode=require` to a hosted Supabase URL.
 */
export function connect(url: string, max = 5): Sql {
  return postgres(url, {
    prepare: false,
    max,
    onnotice: () => {},
    // DB_DEBUG=1 logs every query (first line only), to find slow request paths.
    ...(process.env.DB_DEBUG ? { debug: (_c: number, query: string) => console.log(`[sql] ${query.replace(/\s+/g, " ").trim().slice(0, 90)}`) } : {}),
  });
}

/**
 * The one database connection. Without DATABASE_URL it is null and every repository and source
 * keeps its in-memory version, which is also what the tests use.
 */
@Global()
@Module({
  providers: [{ provide: DATABASE, useFactory: (): Sql | null => (process.env.DATABASE_URL ? connect(process.env.DATABASE_URL) : null) }],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly sql: Sql | null) {}

  /**
   * Opens the pool's connections at startup: each new connection to the pooler costs about two
   * seconds (TLS and auth), which the first requests would otherwise pay. Not awaited.
   */
  onApplicationBootstrap() {
    const sql = this.sql;
    if (!sql) return;
    void Promise.all(Array.from({ length: 4 }, () => sql`select 1`)).catch(() => {});
  }

  async onApplicationShutdown() {
    await this.sql?.end({ timeout: 5 });
  }
}
