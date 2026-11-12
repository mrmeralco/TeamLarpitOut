import { Hono } from "hono";
import { z } from "zod";
import { BillSchema, type Bill } from "./domain/bill.js";
import { splitBillChange } from "./domain/billChange.js";
import { costLines, type RateSchedule, type RateScheduleTable } from "./domain/rateSchedule.js";
import type { BillSource } from "./sources/billSource.js";

/** Every external source sits behind an interface so tests can swap it. */
export interface Deps {
  rateSchedules: RateScheduleTable;
  billSource: BillSource;
}

const BakitGanitoRequest = z.object({ before: BillSchema, now: BillSchema });

class MissingScheduleError extends Error {
  constructor(public period: string) {
    super(`Walang Rate Schedule para sa ${period}`);
  }
}

const toCentavos = (pesos: number) => Math.round(pesos * 100);

function printedTotal(bill: Bill): number | null {
  return bill.chargeLines.length ? bill.chargeLines.reduce((s, l) => s + toCentavos(l.amount), 0) : null;
}

function bakitGanito(deps: Deps, before: Bill, now: Bill) {
  const schedule = (period: string): RateSchedule => {
    const s = deps.rateSchedules.get(period);
    if (!s) throw new MissingScheduleError(period);
    return s;
  };
  const schedBefore = schedule(before.period);
  const schedNow = schedule(now.period);
  const split = splitBillChange(before, now, schedBefore, schedNow);

  const printedBefore = printedTotal(before);
  const printedNow = printedTotal(now);
  const printedChange = printedBefore !== null && printedNow !== null ? printedNow - printedBefore : null;

  const side = (bill: Bill, sched: RateSchedule, rebuilt: number, printed: number | null) => ({
    period: bill.period,
    kwh: bill.kwh,
    billingDays: bill.billingDays,
    rebuiltTotal: rebuilt,
    printedTotal: printed,
    lines: costLines(bill.kwh, bill.billingDays, sched),
  });

  return {
    currency: "PHP-centavos",
    before: side(before, schedBefore, split.costBefore, printedBefore),
    now: side(now, schedNow, split.costNow, printedNow),
    effects: [
      { key: "rate", label: "Rate Effect", amount: split.rateEffect },
      { key: "billingDays", label: "Billing Days Effect", amount: split.billingDaysEffect },
      { key: "weather", label: "Weather Effect", amount: split.weatherEffect },
      { key: "habit", label: "Habit Effect", amount: split.habitEffect },
    ],
    total: split.total,
    /** Change in the totals printed on the two Bills, when charge lines were typed. */
    printedChange,
  };
}

export function createApp(deps: Deps) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof MissingScheduleError) return c.json({ error: err.message, period: err.period }, 422);
    console.error(err);
    return c.json({ error: "Internal error" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/rate-schedules", (c) =>
    c.json({ periods: deps.rateSchedules.periods() }),
  );

  /** "Bakit ganito?" from two typed Bills. */
  app.post("/api/bakit-ganito", async (c) => {
    const parsed = BakitGanitoRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid Bills", issues: parsed.error.issues }, 400);
    return c.json(bakitGanito(deps, parsed.data.before, parsed.data.now));
  });

  /** "Bakit ganito?" from a Household's two latest Bills in its Bill source. */
  app.get("/api/households/:sin/bakit-ganito", async (c) => {
    const bills = await deps.billSource.bills(c.req.param("sin"));
    if (bills.length < 2) return c.json({ error: "Kailangan ng dalawang Bill" }, 404);
    const [before, now] = bills.slice(-2) as [Bill, Bill];
    return c.json(bakitGanito(deps, before, now));
  });

  return app;
}
