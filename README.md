# KuryenteKo · Team LarpItOut

*Bakit ganito ang bill ko?* A phone-first PWA that explains why a household's Meralco Bill changed, split exactly into Rate, Billing Days, Weather and Habit Effects.

Plan, glossary and decisions (ADR-0001, ADR-0002) live in `99lash/meralco-idol-2026` (`docs/challenge-2/KuryenteKo.md`, `GLOSSARY.md`, `docs/adr/`).

## Layout

```
server/src/
  main.ts, app.module.ts, app.setup.ts     bootstrap, root module, global HTTP setup
  common/injection-tokens.ts               tokens for every swappable source (RATE_SCHEDULES, BILL_SOURCE, VISION_PROVIDER)
  domain/                                  pure logic, no Nest: bill, rate-schedule (cost()), bill-change (ADR-0001 split),
                                           bill-extras, charge-catalog, bill-breakdown
  data/rate-schedules.json                 the one Rate Schedule table (SAMPLE values; replace with real Bill lines)
  rate-schedules/                          GET /api/rate-schedules
  bills/                                   Bill DTOs and the Household Bill source
  bill-change/                             "Bakit ganito?"  POST /api/bakit-ganito, GET /api/households/:sin/bakit-ganito
  bill-breakdown/                          "Ano'ng laman?"  POST /api/bills/laman
  bill-scan/                               bill photo -> draft  POST /api/bills/scan
  vision/                                  VisionProvider interface + Gemini provider
  health/                                  GET /api/health
server/test/
  *.e2e-spec.ts                            API-level tests (Vitest + Supertest)
  utils/test-harness.ts                    boots AppModule, overrides providers with fakes

web/src/
  main.tsx, App.tsx                        entry and screen
  api/client.ts                            typed API calls
  components/                              BillBreakdown, ...
  lib/format.ts                            peso formatting
  styles/global.css                        shadcn theme tokens + app styles
```

Conventions: kebab-case files, one class per file with a Nest suffix (`*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/*.dto.ts`, `*.interface.ts`, `*.provider.ts`); React components in PascalCase.

## Stack

TypeScript everywhere, pnpm workspace. Backend: NestJS 12, class-validator, Vitest (+ SWC for decorator metadata), Supertest. Frontend: React 19, Vite, hand-written PWA manifest + service worker. AI (from #2, bill/label photo reading and the Coach): Google Gemini via `@google/genai`, behind an `AiModule` that tests replace with a fake; needs `GEMINI_API_KEY`.

## Run

```sh
pnpm install
cp server/.env.example server/.env   # add GEMINI_API_KEY for bill scan
pnpm dev          # API on :8787, PWA on :5173 (proxies /api)
pnpm test         # API-level tests
pnpm typecheck
```

## API

- `GET  /api/rate-schedules` → `{ periods }`
- `POST /api/bakit-ganito` `{ before: Bill, now: Bill }` → effects, total (centavos)
- `POST /api/bills/scan` (multipart, field `photo`) → editable draft: `now`, `before` (from printed history), `missing`, `estimated`, masked Service ID Number. `422` unreadable, `503` no vision key. Nothing is used until the PWA confirms and posts to `/api/bakit-ganito`.
- `GET  /api/households/:sin/bakit-ganito` → same, from the Household's two latest Bills in the Bill source

`Bill = { period: "YYYY-MM", kwh, billingDays, chargeLines?: [{ label, amount }] }`
