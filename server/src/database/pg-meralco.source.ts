import type { BillSource } from "../bills/bill-source.js";
import type { MeralcoAccount, MeralcoAccountSource } from "../bills/meralco-accounts.js";
import { toBill, type MeralcoBillRecord, type MeralcoChargeLine, type MeralcoPayment } from "../bills/meralco-records.js";
import type { Bill } from "../domain/bill.js";
import type { Sql } from "./database.module.js";

type AccountRow = { can: string; sin: string; area: string; meter_type: MeralcoAccount["meter_type"] };

/**
 * The mock Meralco system in Supabase's `meralco` schema: CAN lookup and each Household's Bills.
 * Read only; the app reaches it through the same seams as the in-memory mock, so a real Meralco
 * API can replace it later.
 */
export class PgMeralcoSource implements BillSource, MeralcoAccountSource {
  constructor(private readonly sql: Sql) {}

  async findByCan(can: string): Promise<MeralcoAccount | null> {
    const [row] = await this.sql<AccountRow[]>`select can, sin, area, meter_type from meralco.accounts where can = ${can}`;
    return row ? { can: row.can, sin: row.sin, area: row.area, meter_type: row.meter_type } : null;
  }

  async household(sin: string): Promise<MeralcoAccount | null> {
    const [row] = await this.sql<AccountRow[]>`select can, sin, area, meter_type from meralco.accounts where sin = ${sin}`;
    return row ? { can: row.can, sin: row.sin, area: row.area, meter_type: row.meter_type } : null;
  }

  async bills(sin: string): Promise<Bill[]> {
    const [account] = await this.sql<{ lifeline_eligible: boolean }[]>`select lifeline_eligible from meralco.accounts where sin = ${sin}`;
    if (!account) return [];
    const rows = await this.sql`
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
      from meralco.bills b where b.sin = ${sin} order by b.period`;
    const payments = (await this.sql<{ for_period: string; posted_on: string; channel: string | null; amount: string }[]>`
      select for_period, posted_on::text, channel, amount_centavos::text as amount from meralco.payments where sin = ${sin} order by posted_on`)
      .map((p): MeralcoPayment => ({ forPeriod: p.for_period, postedOn: p.posted_on, channel: p.channel, amount: Number(p.amount) }));
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
