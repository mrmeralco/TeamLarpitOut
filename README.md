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
- `POST /api/bills/laman` `{ now: Bill, before?: Bill }` → grouped charge lines, pass-through vs Meralco distribution split
- `POST /api/bills/check` `{ now: Bill, before?: Bill, tolerancePesos?: number, payments?: PaymentRecord[] }` → Bill Checks ("Tama ba ito?"): line sum, reading continuity, rate schedule fidelity, payment reflection (overall green / red, disagreeing figures, copyable summary)
- `GET  /api/households/:sin/check` → same Bill Checks for a Household's latest Bill in the Bill source
- `POST /api/bills/scan` (multipart, field `photo`) → editable draft: `now`, `before` (from printed history), `missing`, `estimated`, masked Service ID Number. `422` unreadable, `503` no vision key. Nothing is used until the PWA confirms and posts to `/api/bakit-ganito`.
- `GET  /api/households/:sin/bakit-ganito` → same, from the Household's two latest Bills in the Bill source

`Bill = { period: "YYYY-MM", kwh, billingDays, chargeLines?: [{ label, amount }] }`

### Mock My Meralco login

This is a simulated login; use only the public demo credentials `demo@example.com` / `kuryenteko-demo`.

- `POST /api/auth/login` `{ email, password }` → `{ token, households }` (200). Invalid input returns 400; wrong credentials return 401.
- `GET /api/households` → `[{ sin, masked_address, meter_type }]`, where Meter Type is `traditional` or `smart` and comes from the mock record.
- `POST /api/auth/logout` → 204; revokes the current token.

Send `Authorization: Bearer <token>` for the Household list, logout and `GET /api/households/:sin/bakit-ganito`. Missing, invalid, expired or revoked tokens return 401. Unknown and unlinked Service ID Numbers both return the same 404; membership is checked on every Household request. Tokens expire after one hour and are held in memory, so restarting the API signs everyone out. Login and protected data responses use `Cache-Control: no-store`.

The demo login links two synthetic Households (`1234567890`, traditional; `9876543210`, smart). The PWA shows masked Service ID Numbers and addresses. Pick a Household to load its 12-Bill History and the latest Bill Change; no upload is required. Tokens are kept only in memory in the PWA, so refreshing requires login again. Switching Household or logging out immediately clears the displayed history and cancels pending requests. The UI clears its session on 401 and after one hour.

Scanning and `POST /api/bakit-ganito` remain public. A scan grants no access to Household data. `MY_MERALCO_SOURCE` is the injectable login/Household seam; the API test harness replaces it independently of `BILL_SOURCE` and `VISION_PROVIDER`.

### Bill History and demo data

- `GET /api/households/:sin/bills` → up to twelve `Bill` objects, oldest first, including optional `provenance: { kind, note }`. Requires the same bearer token and ownership checks as the Household explanation route; source failures return 502 without reusing another Household's data.
- The current two demo histories cover December 2025–November 2026. Each has three invented recent samples and nine generated months. **None are represented as real Bills.** The PWA labels both sample and generated months.
- `server/src/data/meralco-demo-seed.json` records recent anchors, synthetic climate inputs and provenance. `server/src/data/meralco-demo.json` is the generated fixture. The extra Rate Schedule rows for older months are explicitly synthetic extrapolations in the existing single Rate Schedule table.
- Real sanitized recent Bills, historical CDD observations and verified published Rate Schedules are still needed to satisfy the real-data demo requirement. Replace the inputs and their provenance before presenting the history as real-derived. Every decoded month must have a schedule; missing schedules still return 422.
- Regenerate deterministically with `pnpm --filter @kuryenteko/server build` followed by `node server/scripts/generate-bill-history.mjs`. The script reuses the actual `costLines()` implementation, preserves supplied recent Bill fields and rejects missing schedules or nonconsecutive periods.
- `HouseholdStore` holds isolated snapshots under each Service ID Number. Restarting recreates the demo fixture; there is no database migration. Future appliance, Mission, typed-reading and Points records must use the same Household boundary, with ownership checked before access. Their feature behavior is outside this ticket.

### Scan linkage

A successful public `POST /api/bills/scan` now includes `scanToken`, an opaque reference valid for fifteen minutes. Only the normalized Service ID Number is retained server-side, with a maximum of 1,000 active references; no photo or scanned Bill is saved. Complete ten-digit identifiers are required for matching; whitespace and hyphens are accepted. Missing or partial identifiers cannot identify a Household.

- `POST /api/bills/scan-linkage` `{ scanToken }`, with `Authorization: Bearer <login token>`, returns `{ status: "linked", householdSin }`, `{ status: "unlinked" }` or `{ status: "unknown" }`.
- Matching uses the full identifier and the current login's linked Households, never a masked suffix or a client-supplied SIN. Invalid input returns 400; missing/expired login returns 401; expired or unknown references return the same 404. A scan reference cannot be used as a login token.
- The PWA resolves linkage after the existing “Tama ba?” confirmation, including when login happens after the scan. Unlinked Bills keep their quick verdict with “Hindi naka-link ang account na ito sa My Meralco mo.” A linked scan offers its matching Household explicitly; it never automatically saves or assigns a Bill. Choosing another linked Household in the picker separately opens that Household's own history.
- `pnpm test` runs the backend HTTP suite plus frontend DOM tests for login, stale responses, Household switching, logout, expiry, errors and scan linkage. Manual browser verification requires a connected browser.
