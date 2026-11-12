import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import postgres from "postgres";
import { DATABASE } from "../common/injection-tokens.js";

export type Sql = postgres.Sql;

/**
 * Connects to Supabase's Postgres through the pooler (Supavisor, transaction mode), so prepared
 * statements are off. Add `?sslmode=require` to a hosted Supabase URL.
 */
export function connect(url: string, max = 5): Sql {
  return postgres(url, { prepare: false, max, onnotice: () => {} });
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
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly sql: Sql | null) {}

  async onApplicationShutdown() {
    await this.sql?.end({ timeout: 5 });
  }
}
