import type { BillSource } from "../bills/bill-source.js";
import type { MeralcoAccount, MeralcoAccountSource } from "../bills/meralco-accounts.js";
import { toBill, type MeralcoBillRecord, type MeralcoChargeLine, type MeralcoPayment } from "../bills/meralco-records.js";
import type { Bill } from "../domain/bill.js";
import type { Sql } from "./database.module.js";

type AccountRow = { can: string; sin: string; area: string; meter_type: MeralcoAccount["meter_type"]; demo: boolean };

const toAccount = (row: AccountRow): MeralcoAccount => ({
  can: row.can, sin: row.sin, area: row.area, meter_type: row.meter_type, ...(row.demo ? { demo: true as const } : {}),
});

/**
 * The mock Meralco system in Supabase's `meralco` schema: CAN lookup and each Household's Bills.
 * Read only; the app reaches it through the same seams as the in-memory mock, so a real Meralco
 * API can replace it later.
 *
 * Supabase is a ~200 ms round trip away and one Home load asks for the same Household's Bills
 * several times, so `bills` runs its queries together and keeps the result for a short while
 * (the schema is read only, so a cached copy can't go stale except through a reseed).
 */
export class PgMeralcoSource implements BillSource, MeralcoAccountSource {
  private readonly cache = new Map<string, { at: number; bills: Promise<Bill[]> }>();

  constructor(private readonly sql: Sql, private readonly ttlMs = 5 * 60_000, private readonly now = () => Date.now()) {}

  async findByCan(can: string): Promise<MeralcoAccount | null> {
    const [row] = await this.sql<AccountRow[]>`select can, sin, area, meter_type, demo from meralco.accounts where can = ${can}`;
    return row ? toAccount(row) : null;
  }

  async household(sin: string): Promise<MeralcoAccount | null> {
    const [row] = await this.sql<AccountRow[]>`select can, sin, area, meter_type, demo from meralco.accounts where sin = ${sin}`;
    return row ? toAccount(row) : null;
  }

  /**
   * Demo mode only: the Household made for a scanned Bill whose CAN is not in the mock data.
   * An existing account with this CAN or SIN is kept, as in the in-memory mock.
   */
  async addDemo(account: MeralcoAccount): Promise<void> {
    await this.sql`
      insert into meralco.accounts (can, sin, holder_name, area, meter_type, demo)
      values (${account.can}, ${account.sin}, 'Demo Household (scanned Bill)', ${account.area}, ${account.meter_type}, true)
      on conflict do nothing`;
  }

  /** Demo mode only: stores a demo Household's Bill History (re-confirming a newer scan replaces it). */
  async setBills(sin: string, bills: Bill[]): Promise<void> {
    await this.sql`
      insert into meralco.demo_histories (sin, bills, updated_at)
      select ${sin}, ${this.sql.json(bills as never)}, now()
      where exists (select 1 from meralco.accounts where sin = ${sin} and demo)
      on conflict (sin) do update set bills = excluded.bills, updated_at = excluded.updated_at`;
    this.cache.delete(sin);
  }

  bills(sin: string): Promise<Bill[]> {
    const hit = this.cache.get(sin);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.bills;
    const bills = this.load(sin);
    this.cache.set(sin, { at: this.now(), bills });
    bills.catch(() => { if (this.cache.get(sin)?.bills === bills) this.cache.delete(sin); });
    return bills;
  }

  private async load(sin: string): Promise<Bill[]> {
    const [accounts, rows, paymentRows, demoRows] = await Promise.all([
      this.sql<{ lifeline_eligible: boolean }[]>`select lifeline_eligible from meralco.accounts where sin = ${sin}`,
      this.sql`
      select b.period, b.period_start::text, b.period_end::text, b.billing_days, b.bill_date::text, b.due_date::text,
             b.meter_number, b.previous_reading, b.present_reading, b.multiplier, b.kwh::float8 as kwh, b.estimated,
             b.total_centavos::int8 as total, b.previous_balance_centavos::int8 as previous_balance,
             b.payments_credited_centavos::int8 as payments_credited, b.provenance, b.provenance_note,
             coalesce((
               select json_agg(json_build_object(
                 'groupCode', l.group_code, 'code', l.code, 'scheduleCode', l.schedule_code, 'label', l.label,
                 'base', l.base, 'baseUnit', l.base_unit, 'price', l.price, 'priceUnit', l.price_unit,
                 'amount', l.amount_centavos) order by l.line_no)
               from meralco.bill_charge_lines l where l.bill_id = b.id), '[]'::json) as lines
      from meralco.bills b where b.sin = ${sin} order by b.period`,
      this.sql<{ for_period: string; posted_on: string; channel: string | null; amount: string }[]>`
      select for_period, posted_on::text, channel, amount_centavos::text as amount from meralco.payments where sin = ${sin} order by posted_on`,
      this.sql<{ bills: Bill[] }[]>`select bills from meralco.demo_histories where sin = ${sin}`,
    ]);
    const account = accounts[0];
    if (!account) return [];
    const demo = demoRows[0];
    if (demo) return [...demo.bills].sort((a, b) => a.period.localeCompare(b.period));
    const payments = paymentRows.map((p): MeralcoPayment => ({ forPeriod: p.for_period, postedOn: p.posted_on, channel: p.channel, amount: Number(p.amount) }));
    return rows.map((r) => toBill(toRecord(r), payments, account.lifeline_eligible));
  }
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toRecord(r: Record<string, any>): MeralcoBillRecord {
  return {
    period: r.period,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    billingDays: Number(r.billing_days),
    billDate: r.bill_date,
    dueDate: r.due_date,
    meterNumber: r.meter_number,
    previousReading: num(r.previous_reading),
    presentReading: num(r.present_reading),
    multiplier: Number(r.multiplier),
    kwh: Number(r.kwh),
    estimated: r.estimated,
    total: Number(r.total),
    previousBalance: Number(r.previous_balance),
    paymentsCredited: num(r.payments_credited),
    provenance: { kind: r.provenance, note: r.provenance_note ?? "" },
    groups: [],
    lines: (r.lines as MeralcoChargeLine[]).map((l) => ({ ...l, amount: Number(l.amount), base: num(l.base), price: num(l.price) })),
  };
}
