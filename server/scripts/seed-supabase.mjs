// Loads the demo data into Supabase: `pnpm --filter @kuryenteko/server db:seed` (builds first).
// Needs DATABASE_URL (server/.env) and the migrations in supabase/migrations applied.
// With LOCAL_SEED_FILE set, the real-Bill Household gets its real CAN from that git-ignored file.
import { existsSync } from "node:fs";
import { connect } from "../dist/database/database.module.js";
import { buildSeed, seedDatabase } from "../dist/database/seed.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in server/.env first (Supabase → Connect → Transaction pooler).");
  process.exit(1);
}
const sql = connect(url, 1);
try {
  const done = await seedDatabase(sql, await buildSeed());
  console.log(`Seeded ${done.households} Households (${done.bills} Bills), ${done.accounts} test logins, ${done.links} link(s).`);
  console.log(`Reference data: ${done.readings} smart meter readings, ${done.outages} outages, ${done.rateSchedules} Rate Schedules, ${done.weatherDays} weather days, ${done.rewards} Rewards.`);
} finally {
  await sql.end({ timeout: 5 });
}
