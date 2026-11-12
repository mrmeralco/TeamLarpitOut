// Run after `pnpm --filter @kuryenteko/server build` to reuse the actual cost engine.
import { readFile, writeFile } from "node:fs/promises";
import { costLines } from "../dist/domain/rate-schedule.js";

const data = new URL("../src/data/", import.meta.url);
const seed = JSON.parse(await readFile(new URL("meralco-demo-seed.json", data), "utf8"));
const { schedules } = JSON.parse(await readFile(new URL("rate-schedules.json", data), "utf8"));
const rates = new Map(schedules.map((s) => [s.period, s]));
const months = seed.months;
if (months.length !== 12 || new Set(months.map((m) => m.period)).size !== 12) throw new Error("Need 12 unique months");
for (const [i, month] of months.entries()) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month.period);
  if (!match || month.billingDays < 1 || !Number.isInteger(month.billingDays) || month.cddPerDay < 0) throw new Error("Invalid month");
  if (i && Number(match[1]) * 12 + Number(match[2]) !== Number(months[i - 1].period.slice(0, 4)) * 12 + Number(months[i - 1].period.slice(5)) + 1) throw new Error("Months must be consecutive");
  if (!rates.has(month.period)) throw new Error(`Missing Rate Schedule: ${month.period}`);
}
const households = seed.households.map((h) => {
  const anchors = h.recentBills;
  if (anchors.length < 2 || anchors.length > 3) throw new Error("Need 2–3 recent Bills per Household");
  for (const [i, anchor] of anchors.entries()) {
    if (anchor.period !== months[months.length - anchors.length + i].period || anchor.kwh < 0 || anchor.billingDays < 1) throw new Error("Invalid recent Bill");
  }
  const daily = anchors.reduce((sum, b) => sum + b.kwh / b.billingDays, 0) / anchors.length;
  const anchorCdd = anchors.reduce((sum, b) => sum + months.find((m) => m.period === b.period).cddPerDay, 0) / anchors.length;
  let reading = h.startReading;
  const bills = months.map((month) => {
    const anchor = anchors.find((b) => b.period === month.period);
    const kwh = anchor?.kwh ?? Math.round(Math.max(0, daily + h.coolingSensitivity * (month.cddPerDay - anchorCdd)) * month.billingDays);
    const billingDays = anchor?.billingDays ?? month.billingDays;
    const next = new Date(`${month.period}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(10);
    const bill = {
      period: month.period, kwh, billingDays,
      chargeLines: costLines(kwh, billingDays, rates.get(month.period)).map((l) => ({ label: l.label, amount: l.amount / 100 })),
      dueDate: next.toISOString().slice(0, 10), previousReading: reading, presentReading: reading + kwh,
      // Supplied Bills override all reconstructed fields; generation never changes them.
      ...anchor,
      provenance: anchor?.provenance ?? { kind: "generated", note: seed.note },
    };
    reading = bill.presentReading ?? reading + bill.kwh;
    return bill;
  });
  return { sin: h.sin, bills };
});
await writeFile(new URL("meralco-demo.json", data), JSON.stringify({ note: seed.note, climateSource: seed.climateSource, households }, null, 2) + "\n");
console.log(`Generated ${households.length} Household histories; ${seed.note}`);
