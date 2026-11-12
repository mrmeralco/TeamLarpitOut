// Run after `pnpm --filter @kuryenteko/server build` to reuse the actual cost engine.
//
// From one real Bill (src/data/meralco-real-bill-seed.json) this writes:
//   1. src/data/rate-schedules.json: the Rate Schedule table rebuilt on the real September 2026
//      rates. Months whose amount paid is known (May–Aug 2026) get the Generation rate that makes
//      the Bill come to exactly what was paid; other months follow a sample Generation pattern.
//   2. src/data/meralco-real-bill.json: the Meralco-shaped record for that Household, the real
//      Bill plus the 11 months before it, rebuilt from the history the real Bill prints.
// Then re-run generate-bill-history.mjs so the older demo Households use the same table.
import { readFile, writeFile } from "node:fs/promises";
import { costLines } from "../dist/domain/rate-schedule.js";
import { GROUP_LABELS, SCHEDULE_LINES } from "../dist/bills/meralco-records.js";

const data = new URL("../src/data/", import.meta.url);
const seed = JSON.parse(await readFile(new URL("meralco-real-bill-seed.json", data), "utf8"));
const oldTable = JSON.parse(await readFile(new URL("rate-schedules.json", data), "utf8"));

const cents = (pesos) => Math.round(pesos * 100);
const real = seed.realBill;
const REAL_PERIOD = real.period;

// Sample month-to-month Generation pattern (index vs September 2026) from the old sample table,
// extended back two months at the same step. Only used where no amount paid is known.
const GENERATION_INDEX = {
  "2025-10": 0.924, "2025-11": 0.932, "2025-12": 0.94, "2026-01": 0.948, "2026-02": 0.956, "2026-03": 0.964,
  "2026-04": 0.972, "2026-05": 0.98, "2026-06": 0.988, "2026-07": 0.996, "2026-08": 1.004, "2026-09": 1,
  "2026-10": 1.03745, "2026-11": 0.97786,
};

// ---------- 1. The real September 2026 schedule ----------
const lineSum = (lines) => lines.reduce((s, l) => s + cents(l.amount), 0);
const groupSum = (code) => lineSum(real.lines.filter((l) => l.groupCode === code));
for (const g of real.groups) {
  if (groupSum(g.groupCode) !== cents(g.amount)) throw new Error(`Lines of ${g.groupCode} do not add up to the printed ${g.amount}`);
}
if (lineSum(real.lines) !== cents(real.total)) throw new Error("Lines do not add up to the printed total");
if (real.presentReading - real.previousReading !== real.kwh) throw new Error("Readings do not match kWh");

/** A per-kWh rate (6 decimals) that reproduces `amount` centavos exactly at `kwh`, as costLines() rounds. */
function rateFor(amount, kwh) {
  let rate = Math.round((amount / 100 / kwh) * 1e6) / 1e6;
  for (let step = 0; Math.round(rate * kwh * 100) !== amount; step++) {
    if (step > 1000) throw new Error(`No 6-decimal rate gives ${amount} centavos at ${kwh} kWh`);
    rate = Math.round((rate + (Math.round(rate * kwh * 100) < amount ? 1e-6 : -1e-6)) * 1e6) / 1e6;
  }
  return rate;
}

/** The printed rates' sum when every non-zero component is per kWh and it reproduces the amounts; else rateFor(). */
function scheduleRate(code, amount, kwh) {
  const parts = real.lines.filter((l) => l.scheduleCode === code && l.amount !== 0);
  if (parts.every((l) => l.priceUnit === "per_kwh")) {
    const printed = Math.round(parts.reduce((s, l) => s + l.price, 0) * 1e6) / 1e6;
    if (Math.round(printed * kwh * 100) === amount) return printed;
  }
  return rateFor(amount, kwh);
}

const template = oldTable.schedules.find((s) => s.period === "2026-09");
const passThrough = (code) => template.perKwh.find((c) => c.code === code)?.passThrough ?? true;
const byCode = new Map();
for (const l of real.lines) byCode.set(l.scheduleCode, (byCode.get(l.scheduleCode) ?? 0) + cents(l.amount));
const FIXED = new Set(["supply_fixed", "metering_fixed", "vat_fixed"]);
const realSchedule = {
  period: REAL_PERIOD,
  _note: "Real: every rate comes from a real September 2026 Meralco Bill (273 kWh). Lines with several printed components (Transmission + Ancillary; Distribution net of AWAT refunds; Universal Charges; VAT and local taxes, which the Bill charges as percentages) are rolled into one per-kWh rate that reproduces the printed amounts at 273 kWh.",
  perKwh: SCHEDULE_LINES.filter((s) => !FIXED.has(s.code) && byCode.has(s.code)).map((s) => ({
    code: s.code, label: s.label, rate: scheduleRate(s.code, byCode.get(s.code), real.kwh), passThrough: s.code === "local_tax" ? true : passThrough(s.code),
  })),
  fixed: SCHEDULE_LINES.filter((s) => FIXED.has(s.code)).map((s) => ({ code: s.code, label: s.label, amount: byCode.get(s.code) / 100 })),
  lifeline: template.lifeline,
};
const realCost = costLines(real.kwh, real.billingDays, realSchedule).reduce((s, l) => s + l.amount, 0);
if (realCost !== cents(real.total)) throw new Error(`Rebuilt real schedule gives ${realCost}, Bill says ${cents(real.total)}`);

// ---------- 2. Every other month ----------
const realGeneration = realSchedule.perKwh.find((c) => c.code === "generation").rate;
const withGeneration = (period, rate, note) => ({
  ...structuredClone(realSchedule),
  period,
  _note: note,
  perKwh: realSchedule.perKwh.map((c) => (c.code === "generation" ? { ...c, rate } : { ...c })),
});

const historyByPeriod = new Map(seed.history.months.map((m) => [m.period, m]));
const schedules = Object.keys(GENERATION_INDEX).sort().map((period) => {
  if (period === REAL_PERIOD) return realSchedule;
  const month = historyByPeriod.get(period);
  if (month?.paidTotal !== undefined) {
    const others = costLines(month.kwh, 30, realSchedule).filter((l) => l.code !== "generation").reduce((s, l) => s + l.amount, 0);
    const rate = rateFor(cents(month.paidTotal) - others, month.kwh);
    return withGeneration(period, rate, `Reconstructed: the real September 2026 rates, with the Generation rate set so this Household's ${month.kwh} kWh comes to exactly the ₱${month.paidTotal.toFixed(2)} it paid for this month.`);
  }
  const rate = Math.round(realGeneration * GENERATION_INDEX[period] * 1e4) / 1e4;
  return withGeneration(period, rate, "Sample: the real September 2026 rates, with a sample Generation rate (not published Meralco data).");
});

const table = {
  _note: "The one Rate Schedule table (ADR-0001), rebuilt on a real September 2026 Meralco residential Bill by scripts/generate-real-bill-history.mjs; each month's _note says whether it is real, reconstructed from an amount paid, or sample. Per-kWh rates are pesos per kWh; fixed amounts are pesos per customer per month. Lifeline tiers are SAMPLE: confirm the current ERC-approved Meralco lifeline brackets before the demo.",
  schedules,
};
await writeFile(new URL("rate-schedules.json", data), JSON.stringify(table, null, 2) + "\n");

// ---------- 3. The Household's twelve Bills ----------
const iso = (d) => d.toISOString().slice(0, 10);
const day = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (s, n) => { const d = day(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const scheduleFor = new Map(schedules.map((s) => [s.period, s]));

const reconstructedNote = (month) => `Reconstructed from the September 2026 Bill: kWh from its consumption chart, readings counted back from its previous reading${month.paidTotal !== undefined ? `, total = the ₱${month.paidTotal.toFixed(2)} paid ("What you've paid")` : ", total priced with a sample Generation rate"}. Charge lines rebuilt with this month's Rate Schedule.`;

let reading = real.previousReading;
let periodEnd = addDays(real.periodStart, -1);
const history = [...seed.history.months].sort((a, b) => b.period.localeCompare(a.period)).map((month) => {
  const end = periodEnd;
  const startDate = day(end);
  startDate.setUTCMonth(startDate.getUTCMonth() - 1);
  const start = addDays(iso(startDate), 1);
  const billingDays = Math.round((day(end) - day(start)) / 86_400_000) + 1;
  if (`${end.slice(0, 7)}` !== month.period) throw new Error(`Period ${month.period} does not end on ${end}`);
  const present = reading;
  const previous = present - month.kwh;
  reading = previous;
  periodEnd = addDays(start, -1);
  const lines = costLines(month.kwh, billingDays, scheduleFor.get(month.period)).map((l) => {
    const meta = SCHEDULE_LINES.find((s) => s.code === l.code);
    const fixed = l.kind === "fixed";
    const rate = fixed ? null : scheduleFor.get(month.period).perKwh.find((c) => c.code === l.code).rate;
    return {
      groupCode: meta.group, code: l.code, scheduleCode: l.code, label: l.label,
      base: fixed ? 1 : month.kwh, baseUnit: fixed ? "month" : "kwh",
      price: fixed ? l.amount / 100 : rate, priceUnit: fixed ? "per_month" : "per_kwh",
      amount: l.amount,
    };
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  if (month.paidTotal !== undefined && total !== cents(month.paidTotal)) throw new Error(`${month.period} rebuilt to ${total}, paid ${cents(month.paidTotal)}`);
  const groups = [...new Set(lines.map((l) => l.groupCode))].map((g) => ({
    groupCode: g, label: GROUP_LABELS[g], amount: lines.filter((l) => l.groupCode === g).reduce((s, l) => s + l.amount, 0),
  }));
  return {
    period: month.period, periodStart: start, periodEnd: end, billingDays,
    billDate: end, dueDate: addDays(end, 12), meterNumber: seed.account.meterNumber,
    previousReading: previous, presentReading: present, multiplier: 1, kwh: month.kwh, estimated: false,
    total, previousBalance: 0, paymentsCredited: null,
    provenance: { kind: "reconstructed", note: reconstructedNote(month) },
    groups, lines,
  };
}).reverse();

const realRecord = {
  period: real.period, periodStart: real.periodStart, periodEnd: real.periodEnd, billingDays: real.billingDays,
  billDate: real.billDate, dueDate: real.dueDate, meterNumber: seed.account.meterNumber,
  previousReading: real.previousReading, presentReading: real.presentReading, multiplier: real.multiplier,
  kwh: real.kwh, estimated: false, total: cents(real.total), previousBalance: cents(real.previousBalance),
  paymentsCredited: cents(real.paymentsCredited),
  provenance: { kind: "real", note: "A real Meralco Bill, transcribed line by line with the account holder's consent. Identifiers are placeholders." },
  groups: real.groups.map((g) => ({ ...g, amount: cents(g.amount) })),
  lines: real.lines.map((l) => ({ ...l, amount: cents(l.amount) })),
};

const record = {
  note: seed.note,
  account: { ...seed.account, meter_type: seed.account.meterType, meterType: undefined },
  bills: [...history, realRecord],
  payments: seed.payments.map((p) => ({ ...p, amount: cents(p.amount) })),
};
await writeFile(new URL("meralco-real-bill.json", data), JSON.stringify(record, null, 2) + "\n");
console.log(`Rebuilt ${schedules.length} Rate Schedules and ${record.bills.length} Bills for the real-Bill Household.`);
