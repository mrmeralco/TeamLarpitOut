# KuryenteKo · Team LarpItOut

*Bakit ganito ang bill ko?* A phone-first PWA that explains why a household's Meralco Bill changed, split exactly into Rate, Billing Days, Weather and Habit Effects.

Plan, glossary and decisions (ADR-0001, ADR-0002) live in `99lash/meralco-idol-2026` (`docs/challenge-2/KuryenteKo.md`, `GLOSSARY.md`, `docs/adr/`).

## Layout

| Path | What |
|---|---|
| `server/` | Backend HTTP API (Hono). The one seam tests go through. |
| `server/src/data/rate-schedules.json` | The one Rate Schedule table: Per-kWh and Fixed Charges per month. **Sample values: replace with real Bill lines.** |
| `server/src/domain/rateSchedule.ts` | `cost(kWh, days, schedule)`, in integer centavos |
| `server/src/domain/billChange.ts` | The Bill Change split (ADR-0001) |
| `server/src/sources/` | Bill sources behind a `BillSource` interface |
| `server/test/harness.ts` | API test harness: inject Rate Schedules and fake Bill sources |
| `web/` | Vite + React PWA |

## Run

```sh
pnpm install
pnpm dev          # API on :8787, PWA on :5173 (proxies /api)
pnpm test         # API-level tests
pnpm typecheck
```

## API

- `GET  /api/rate-schedules` → `{ periods }`
- `POST /api/bakit-ganito` `{ before: Bill, now: Bill }` → effects, total (centavos)
- `GET  /api/households/:sin/bakit-ganito` → same, from the Household's two latest Bills in the Bill source

`Bill = { period: "YYYY-MM", kwh, billingDays, chargeLines?: [{ label, amount }] }`
