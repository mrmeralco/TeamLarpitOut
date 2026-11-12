import type { Account } from "../auth/account.repository.js";
import { ownerIdForEmail } from "../auth/auth.service.js";
import { demoAccounts, demoLinks } from "../auth/demo-logins.js";
import { DEMO_ACCOUNTS } from "../bills/meralco-accounts.js";
import { recordFromBill, type MeralcoHouseholdRecord } from "../bills/meralco-records.js";
import { meralcoAccountOf, readLocalSeed, realBillHousehold, type LocalSeed } from "../bills/real-bill-household.js";
import demo from "../data/meralco-demo.json" with { type: "json" };
import rateTable from "../data/rate-schedules.json" with { type: "json" };
import type { Bill } from "../domain/bill.js";
import { datesBetween } from "../domain/daily-points.js";
import { DEMO_CLIMATE_DATES, DEMO_SMART_SIN, demoTemperatureC } from "../domain/demo-climate.js";
import type { HourlyReading } from "../domain/meter-reading.js";
import type { RateSchedule } from "../domain/rate-schedule.js";
import { SAMPLE_REWARDS_CATALOG, type RewardItem } from "../domain/rewards.js";
import { MockReadingSource } from "../smart-meter/mock-reading-source.provider.js";
import type { HouseholdLink } from "../households/household-link.repository.js";
import type { Sql } from "./database.module.js";

export interface SeedData {
  households: MeralcoHouseholdRecord[];
  accounts: Account[];
  links: HouseholdLink[];
  /** Households whose links the seed resets, so re-seeding gives the demo its starting state. */
  resetLinksFor: string[];
  /** Data that used to live in code or JSON (migration 20261113000600). */
  reference: ReferenceData;
}

export interface SampleOutage { sin: string; period: string; date: string; durationHours: number; description: string }

export interface ReferenceData {
  /** Sample smart meter readings, by Household. */
  readings: { sin: string; rows: HourlyReading[] }[];
  /** Sample outages on Meralco's record, by Household. */
  outages: SampleOutage[];
  /** Meralco's Rate Schedules, the same for every customer. */
  rateSchedules: (RateSchedule & { _note?: string })[];
  /** Sample daily temperatures, by area. */
  weather: { area: string; date: string; temperatureC: number }[];
  /** Partner Rewards. */
  rewards: readonly RewardItem[];
}

/** The simulated year (Dec 2025–Nov 2026) the mock smart meter and daily weather used, now stored. */
export async function buildReferenceData(areas: string[]): Promise<ReferenceData> {
  const year = { from: `${DEMO_CLIMATE_DATES.from}T00:00:00+08:00`, to: `${DEMO_CLIMATE_DATES.to}T00:00:00+08:00` };
  return {
    // Without a plan the mock gives the household's usual use; following Missions is applied when read.
    readings: [{ sin: DEMO_SMART_SIN, rows: await new MockReadingSource().readings(DEMO_SMART_SIN, year) }],
    outages: [
      { sin: "1234567890", period: "2026-06", date: "2026-06-18", durationHours: 4, description: "Scheduled maintenance (sample)" },
      { sin: DEMO_SMART_SIN, period: "2026-08", date: "2026-08-14", durationHours: 3, description: "Feeder repair (sample)" },
    ],
    rateSchedules: rateTable.schedules as (RateSchedule & { _note?: string })[],
    weather: [...new Set(areas)].flatMap((area) => datesBetween(DEMO_CLIMATE_DATES.from, DEMO_CLIMATE_DATES.to)
      .map((date) => ({ area, date, temperatureC: demoTemperatureC(date) }))),
    rewards: SAMPLE_REWARDS_CATALOG,
  };
}

const chunks = <T>(items: T[], size = 2000): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/**
 * What `pnpm db:seed` loads: the real-Bill Household, the two sample Households, and the two test
 * logins (traditional@ holds the real-Bill Household, smart-meter@ the smart sample one).
 */
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
    resetLinksFor: [real.account.sin, DEMO_SMART_SIN],
    reference: await buildReferenceData([real, ...samples].map((h) => h.account.area)),
  };
}

/**
 * Loads the seed in one transaction. Re-running replaces each seeded Household's Meralco records,
 * resets the test logins' passwords and who holds the seeded Households; other sign-ups and their
 * links to other Households are left alone.
 *
 * `fresh` (`pnpm db:reseed`) first deletes every login (with its sessions and links), every
 * Household's Setup, appliances, Mission Plans, readings typed in and Points, and every Meralco
 * Household that is not seeded, so only the seeded data and the test logins remain.
 */
export async function seedDatabase(sql: Sql, data: SeedData, { fresh = false }: { fresh?: boolean } = {}) {
  let bills = 0;
  let removedLogins = 0;
  await sql.begin(async (tx) => {
    if (fresh) {
      removedLogins = (await tx`delete from public.accounts`).count; // sessions and links cascade
      await tx`delete from public.household_setup`;
      await tx`delete from public.appliances`;
      await tx`delete from public.usage_plans`; // its Missions cascade
      await tx`delete from public.points_entries`;
      await tx`delete from public.mid_month_readings`;
      await tx`delete from public.mission_reminders`;
      await tx`delete from public.household_changes`;
      await tx`delete from meralco.accounts where sin not in ${tx(data.households.map((h) => h.account.sin))}`;
    }
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
    await seedReferenceData(tx, data.reference);
  });
  const ref = data.reference;
  return {
    households: data.households.length, bills, accounts: data.accounts.length, links: data.links.length, removedLogins,
    readings: ref.readings.reduce((s, r) => s + r.rows.length, 0), outages: ref.outages.length,
    rateSchedules: ref.rateSchedules.length, weatherDays: ref.weather.length, rewards: ref.rewards.length,
  };
}

/**
 * Readings and outages belong to seeded Households, so re-seeding a Household (which deletes its
 * Meralco records) replaces them. Rate Schedules, weather and Rewards are replaced by key.
 */
async function seedReferenceData(tx: Sql, ref: ReferenceData) {
  for (const { sin, rows } of ref.readings) {
    await tx`delete from meralco.meter_readings where sin = ${sin}`;
    for (const part of chunks(rows.map((r) => ({ sin, hour_start: new Date(r.from), wh: r.wh, provenance: "sample" })))) {
      await tx`insert into meralco.meter_readings ${tx(part)}`;
    }
  }
  for (const sin of new Set(ref.outages.map((o) => o.sin))) await tx`delete from meralco.outages where sin = ${sin} and provenance = 'sample'`;
  if (ref.outages.length) {
    await tx`insert into meralco.outages ${tx(ref.outages.map((o) => ({
      sin: o.sin, period: o.period, outage_date: o.date, duration_hours: o.durationHours, description: o.description, provenance: "sample",
    })))}`;
  }
  for (const s of ref.rateSchedules) {
    await tx`
      insert into meralco.rate_schedules (period, per_kwh, fixed, lifeline, note, provenance)
      values (${s.period}, ${tx.json(s.perKwh as never)}, ${tx.json(s.fixed as never)}, ${s.lifeline ? tx.json(s.lifeline as never) : null}, ${s._note ?? null}, 'sample')
      on conflict (period) do update set per_kwh = excluded.per_kwh, fixed = excluded.fixed, lifeline = excluded.lifeline,
        note = excluded.note, provenance = excluded.provenance`;
  }
  for (const part of chunks(ref.weather.map((w) => ({ area: w.area, date: w.date, temperature_c: w.temperatureC, provenance: "sample" })))) {
    await tx`
      insert into public.weather_daily ${tx(part)}
      on conflict (area, date) do update set temperature_c = excluded.temperature_c, provenance = excluded.provenance`;
  }
  for (const [i, r] of ref.rewards.entries()) {
    await tx`
      insert into public.rewards (id, name, category, partner_name, points_cost, description, is_sample, active, sort_order)
      values (${r.id}, ${r.name}, ${r.category}, ${r.partnerName}, ${r.pointsCost}, ${r.description}, ${r.isSampleReward}, true, ${i})
      on conflict (id) do update set name = excluded.name, category = excluded.category, partner_name = excluded.partner_name,
        points_cost = excluded.points_cost, description = excluded.description, is_sample = excluded.is_sample, sort_order = excluded.sort_order`;
  }
}
