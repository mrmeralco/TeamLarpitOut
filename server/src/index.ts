import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import table from "./data/rate-schedules.json" with { type: "json" };
import { rateScheduleTable, type RateSchedule } from "./domain/rateSchedule.js";
import { inMemoryBillSource } from "./sources/billSource.js";

const app = createApp({
  rateSchedules: rateScheduleTable(table.schedules as RateSchedule[]),
  billSource: inMemoryBillSource(),
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`KuryenteKo API on http://localhost:${port}`));
