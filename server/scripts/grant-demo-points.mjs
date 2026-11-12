// Gives each demo Household its spendable demo Points without a full re-seed (which would also reset links):
// `pnpm --filter @kuryenteko/server build && node scripts/grant-demo-points.mjs`. Applies migration 20261113000800 first.
import { existsSync, readFileSync } from "node:fs";
import { connect } from "../dist/database/database.module.js";
import { grantDemoBonus } from "../dist/database/seed.js";
import { readLocalSeed, realBillHousehold } from "../dist/bills/real-bill-household.js";
import { DEMO_ACCOUNTS } from "../dist/bills/meralco-accounts.js";
import { DEMO_BONUS_POINTS } from "../dist/domain/demo-points.js";

if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL in server/.env first.");
  process.exit(1);
}
const sql = connect(process.env.DATABASE_URL, 1);
try {
  await sql.unsafe(readFileSync(new URL("../../supabase/migrations/20261113000800_demo_bonus_points.sql", import.meta.url), "utf8"));
  const sins = [realBillHousehold(readLocalSeed()).account.sin, ...DEMO_ACCOUNTS.map((a) => a.sin)];
  for (const sin of sins) await grantDemoBonus(sql, sin);
  const rows = await sql`select sin, sum(points)::int as balance from public.points_entries where sin in ${sql(sins)} group by sin`;
  console.log(`Gave ${sins.length} demo Households ${DEMO_BONUS_POINTS} Points each. Balances: ${rows.map((r) => `•••${r.sin.slice(-4)} ${r.balance}`).join(", ")}`);
} finally {
  await sql.end({ timeout: 5 });
}
