import type { Account } from "../auth/account.repository.js";
import { ownerIdForEmail } from "../auth/auth.service.js";
import { demoAccounts, demoLinks } from "../auth/demo-logins.js";
import { DEMO_ACCOUNTS } from "../bills/meralco-accounts.js";
import { recordFromBill, type MeralcoHouseholdRecord } from "../bills/meralco-records.js";
import { meralcoAccountOf, readLocalSeed, realBillHousehold, type LocalSeed } from "../bills/real-bill-household.js";
import demo from "../data/meralco-demo.json" with { type: "json" };
import type { Bill } from "../domain/bill.js";
import type { HouseholdLink } from "../households/household-link.repository.js";
import type { Sql } from "./database.module.js";

export interface SeedData {
  households: MeralcoHouseholdRecord[];
  accounts: Account[];
  links: HouseholdLink[];
  /** Households whose links the seed resets, so re-seeding gives the demo its starting state. */
  resetLinksFor: string[];
}

/** What `pnpm db:seed` loads: the real-Bill Household, the two sample Households, the test logins. */
export async function buildSeed(local: LocalSeed = readLocalSeed()): Promise<SeedData> {
  const real = realBillHousehold(local);
  const samples = DEMO_ACCOUNTS.map((account): MeralcoHouseholdRecord => ({
    account: { ...account, holderName: "Sample Household (synthetic)", meterNumber: null, lifelineEligible: false },
    bills: (demo.households.find((h) => h.sin === account.sin)?.bills ?? []).map((b) => recordFromBill(b as Bill)),
    payments: [],
  }));
  return {
    households: [real, ...samples],
    accounts: await demoAccounts(),
    links: demoLinks(meralcoAccountOf(real)),
    resetLinksFor: [real.account.sin],
  };
}

/**
 * Loads the seed in one transaction. Re-running replaces each seeded Household's Meralco records,
 * resets the test logins' passwords and who holds the real-Bill Household; other sign-ups and
 * their links to other Households are left alone.
 */
export async function seedDatabase(sql: Sql, data: SeedData) {
  let bills = 0;
  await sql.begin(async (tx) => {
    for (const { account, bills: records, payments } of data.households) {
      await tx`delete from meralco.accounts where can = ${account.can} or sin = ${account.sin}`;
      await tx`
        insert into meralco.accounts (can, sin, holder_name, area, meter_type, meter_number, lifeline_eligible)
        values (${account.can}, ${account.sin}, ${account.holderName}, ${account.area}, ${account.meter_type}, ${account.meterNumber}, ${account.lifelineEligible})`;
      for (const b of records) {
        const [{ id }] = await tx<{ id: string }[]>`
          insert into meralco.bills (sin, period, period_start, period_end, billing_days, bill_date, due_date, meter_number,
            previous_reading, present_reading, multiplier, kwh, estimated, total_centavos, previous_balance_centavos,
            payments_credited_centavos, provenance, provenance_note)
          values (${account.sin}, ${b.period}, ${b.periodStart}, ${b.periodEnd}, ${b.billingDays}, ${b.billDate}, ${b.dueDate}, ${b.meterNumber},
            ${b.previousReading}, ${b.presentReading}, ${b.multiplier}, ${b.kwh}, ${b.estimated}, ${b.total}, ${b.previousBalance},
            ${b.paymentsCredited}, ${b.provenance.kind}, ${b.provenance.note})
          returning id`;
        if (b.groups.length) {
          await tx`insert into meralco.bill_charge_groups ${tx(b.groups.map((g, i) => ({
            bill_id: id, group_code: g.groupCode, label: g.label, amount_centavos: g.amount, sort_order: i,
          })))}`;
        }
        if (b.lines.length) {
          await tx`insert into meralco.bill_charge_lines ${tx(b.lines.map((l, i) => ({
            bill_id: id, line_no: i, group_code: l.groupCode, code: l.code, schedule_code: l.scheduleCode, label: l.label,
            base: l.base, base_unit: l.baseUnit, price: l.price, price_unit: l.priceUnit, amount_centavos: l.amount,
          })))}`;
        }
        bills++;
      }
      if (payments.length) {
        await tx`insert into meralco.payments ${tx(payments.map((p) => ({
          sin: account.sin, for_period: p.forPeriod, posted_on: p.postedOn, channel: p.channel, amount_centavos: p.amount,
        })))}`;
      }
    }
    for (const a of data.accounts) {
      await tx`
        insert into public.accounts (owner_id, email, phone, phone_verified, password_hash, created_at)
        values (${ownerIdForEmail(a.email)}, ${a.email}, ${a.phone}, ${a.phoneVerified}, ${a.passwordHash}, ${a.createdAt})
        on conflict (owner_id) do update set phone = excluded.phone, phone_verified = excluded.phone_verified, password_hash = excluded.password_hash`;
    }
    // Whoever linked the real-Bill Household during a demo is unlinked; the seeded owner (if any) gets it back.
    if (data.resetLinksFor.length) await tx`delete from public.household_links where sin in ${tx(data.resetLinksFor)}`;
    for (const l of data.links) {
      await tx`
        insert into public.household_links (owner_id, sin, can, status) values (${l.ownerId}, ${l.sin}, ${l.can}, ${l.status})
        on conflict (owner_id, sin) do update set can = excluded.can, status = excluded.status`;
    }
  });
  return { households: data.households.length, bills, accounts: data.accounts.length, links: data.links.length };
}
