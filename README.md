# KuryenteKo · Team LarpItOut

*Bakit ganito ang bill ko?* A phone-first PWA that explains why a household's Meralco Bill changed, split exactly into Rate, Billing Days, Weather and Habit Effects.

Plan: [`docs/challenge-2/KuryenteKo.md`](docs/challenge-2/KuryenteKo.md) · Vocabulary: [`GLOSSARY.md`](GLOSSARY.md) · Decisions: [`docs/adr/`](docs/adr/) (ADR-0001, ADR-0002) · Challenge: [`docs/challenge-2/Challenge-2-Official-Description.md`](docs/challenge-2/Challenge-2-Official-Description.md). Copied from the planning repo `99lash/meralco-idol-2026` on 2026-11-12; update both when the plan changes.

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
- `POST /api/households/:sin/appliances/scan-label` (authenticated multipart, fields `photo` and `type`: `aircon` or `refrigerator`) → editable energy-label draft; see below.
- `GET  /api/households/:sin/bakit-ganito` → same, from the Household's two latest Bills in the Bill source

`Bill = { period: "YYYY-MM", kwh, billingDays, chargeLines?: [{ label, amount }] }`

### DOE energy labels

In the appliance survey, aircon and refrigerator cards offer photo upload/capture. Review the stated kWh, its daily/monthly period, and its reference basis, then choose **Tama, gamitin ang energy label**. This changes only the local survey; the existing **I-save** action persists it. Retaking or cancelling a scan keeps any previously confirmed value. Removing a label restores visual answers or the default estimate. Unconfirmed drafts never enter the save payload.

The scan endpoint uses the existing session and Household membership guards. Upload a JPEG, PNG, WebP, HEIC, or HEIF photo of at most 10 MiB. Successful responses use `Cache-Control: no-store` and contain:

```json
{
  "status": "read",
  "type": "aircon",
  "label": { "consumptionKwh": 270, "period": "monthly", "referenceDays": 30, "referenceHoursPerDay": 9 },
  "kwhPerHour": 1,
  "missing": [],
  "assumptions": [],
  "needsConfirmation": true
}
```

The example uses an explicit 30-day, 9-hour basis. Vision extracts printed consumption only; watts, cooling capacity, CSEC, and efficiency ratings are never substituted for kWh. Unprinted monthly reference days are prefilled as 30, and unprinted aircon operating hours as 9, **each flagged in `assumptions` with a reason for the user to review**. These are project assumptions, not a claim that every DOE label uses them. Printed values take priority. Invalid or ambiguous fields remain null in `label` and are listed in `missing`; normalization remains null until the basis is complete. A refrigerator's consumption is averaged over the full 24-hour day.

The existing `PUT /api/households/:sin/appliances` accepts an optional `energyLabel` per aircon/ref: `{ consumptionKwh, period: "monthly" | "daily", referenceDays?, referenceHoursPerDay?, confirmed: true }`. Monthly values require positive reference days; aircon requires positive reference hours/day up to 24. Daily values cover one day. Save recomputes kWh/hour server-side, adapts refrigerator values to the estimator's kWh/day, and ignores client-supplied derived values. Confirmed labels take priority over answers and defaults, with **Mula sa energy label** in the breakdown. Quantity and routine are applied separately, and the breakdown still calibrates exactly to Bill kWh and centavo totals.

Scan errors: `400` missing photo, unsupported type or MIME; `413` oversized photo; `422` unreadable label or detected appliance mismatch; `503` missing vision configuration; `502` provider failure. Missing/expired login returns `401`, unknown/unlinked Households return the same `404`. A failed scan leaves answers/defaults usable. The browser cancels scans on retake, card removal, Household/session change, or logout, and ignores delayed results.

Label scanning uses the same `GEMINI_API_KEY` / `GEMINI_MODEL` configuration as Bill scanning. Photos and scan drafts are not retained by the application. Only confirmed label values are saved with appliances in the current **in-memory, per-Household repository**, lost on server restart; no migration is required. Automated checks use an injected fake vision provider and do not call Gemini.

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

### Mock smart meter readings and usage chart (issue #10)

`GET /api/households/:sin/readings?from=<ISO timestamp>&to=<ISO timestamp>&interval=hour|day|week`

This endpoint requires the same bearer token and current Household ownership checks as Bill History. Meter Type comes from the server's My Meralco record. Linked traditional Households return `422` without consulting the reading source; missing/expired/revoked sessions return `401`, and unknown/unlinked Service ID Numbers return the same `404`. Source failures or malformed source readings return `502`. Successful responses use `Cache-Control: no-store`.

The response contains:

```json
{
  "sin": "9876543210",
  "interval": "day",
  "timeZone": "Asia/Manila",
  "range": { "from": "2026-11-01T16:00:00.000Z", "to": "2026-11-02T16:00:00.000Z" },
  "available": { "from": "2025-12-01T00:00:00+08:00", "to": "2026-12-01T00:00:00+08:00" },
  "provenance": { "kind": "synthetic", "note": "Fixed simulation; not real Meralco readings." },
  "readings": [{ "from": "2026-11-01T16:00:00.000Z", "to": "2026-11-02T16:00:00.000Z", "kwh": 12.345, "partial": false }]
}
```

The sample above illustrates the response shape; the kWh value and shortened note are illustrative. Readings represent **consumption per interval**, not cumulative meter values.

- Ranges are half-open `[from, to)`. Supply both bounds or neither. Explicit bounds must be valid ISO timestamps with seconds, a timezone (`Z` or offset), and hour alignment; encode `+` as `%2B` in query strings. Reversed/equal bounds, unsupported intervals, repeated parameters, and ranges exceeding 366 days return `400`.
- `interval` defaults to `day`. With both bounds omitted, the API uses the latest 24 hours / 30 days / 12 weeks for hour / day / week, clipped to the source's advertised available window. This lets a client discover simulation dates without hardcoding them. With no available data, the default `range` and `available` are `null` and `readings` is empty.
- Daily buckets start at Manila midnight; weekly buckets start Monday at Manila midnight. Response bucket timestamps are UTC ISO strings. Boundary buckets are clipped to the requested range. `partial: true` means the full calendar bucket is not covered, including missing source hours. Missing hours are not invented as zeroes; valid ranges without readings return an empty array. Consumers must not treat partial buckets as full-period totals.
- The demo smart Household (`9876543210`) has a fixed **December 2025–November 2026 simulation**, including simulated future hours relative to the development date. It is not live telemetry. Invented seasonal temperatures drive a sustained 10 PM–6 AM aircon load, alongside base load and evening activity. The mock calculates deterministic integer Wh and aggregates before converting to kWh. It does not claim reconciliation with the separately generated Bills or supply evidence for Bill Checks.
- `READING_SOURCE` is a separately injectable `ReadingSource` with metadata and hourly readings keyed by Service ID Number. The test harness accepts `readings` fixtures or a `readingSource` fake independently of Bills and weather. The default mock is in-process and needs no API key, network, database, or migration.

For a logged-in demo session, `GET /api/households/9876543210/readings` returns the default daily window. `GET /api/households/9876543210/readings?interval=hour` returns hourly usage. Explicit example: `GET /api/households/9876543210/readings?from=2026-11-02T00:00:00%2B08:00&to=2026-11-03T00:00:00%2B08:00&interval=day`.

Log in with `demo@example.com` / `kuryenteko-demo`, then choose the **Smart meter** Household. Bill History and daily usage load automatically; no Bill upload is needed. Traditional Households load Bills without requesting or displaying interval usage.

The **Hour / Day / Week** buttons show the latest 24 hours / 30 days / 12 weeks available from the source, with Day selected initially. The frontend omits date bounds and lets the API choose these windows from its metadata; they are simulation dates, not a live rolling window. Charts and expandable readings tables use `Asia/Manila`, kWh per interval, exact start/end times, and partial coverage indicators. Weeks begin Monday. Totals include only returned readings; missing hours are not zero-filled. Synthetic usage is independent of the demo Bills and need not match their consumption totals.

Switching intervals cancels the previous load and clears its chart. Switching Household, clearing selection, logout, and session expiry clear protected usage immediately. Reading errors have their own retry and leave Bills usable; a protected `401` returns the app to login. Retry keeps the selected interval; choosing a different Household resets to Day.

Run `pnpm test`, `pnpm typecheck`, and `pnpm build` for workspace checks. UI tests cover automatic smart-only loading, accessible values, interval switching, retry, and delayed-response isolation; API tests exercise injected reading sources.

### Smart-meter aircon pattern proposals (issue #14)

`POST /api/households/:sin/appliances/aircon-pattern-proposal` accepts the current aircon draft:

```json
{
  "quantity": 1,
  "answers": { "mount": "split", "inverter": "no", "room": "medium" },
  "energyLabel": { "consumptionKwh": 270, "period": "monthly", "referenceDays": 30, "referenceHoursPerDay": 9, "confirmed": true }
}
```

All three fields are optional. The server recomputes the expected kW using confirmed label → visual answers → default, then multiplies by quantity (units sharing the same routine). Client-derived kW and unconfirmed labels are not used. Requesting a proposal never writes appliances.

The route uses the existing bearer session and current Household membership checks: `401` for missing, expired, or revoked login; the same `404` for unknown and unlinked Households; `422` for a traditional meter; `400` for invalid appliance details; `502` for failed or malformed reading-source data. Successful responses use `Cache-Control: no-store`.

- A `200` proposal has `status: "proposal"`, `canPropose: true`, the actual `routine: { start, end, days: "everyday" }`, `hours`, estimated excess `stepKw`, tentative `prompt`, heat evidence, and coverage counts.
- A valid insufficient-evidence response is `200` with `status: "fallback"`, `canPropose: false`, `fallback: "routine"`, and a machine-readable `reason`. Missing, failed, malformed, or incompatible daily weather also falls back to routine questions.
- Both responses include `timeZone: "Asia/Manila"`, the analyzed `range` (null if no readings are available), `expectedKw`, `ratingSource`, and separate reading/weather provenance. Coverage reports complete nights, matching nights, and nights paired with weather; the weather provenance is null when unavailable.

The bounded analysis ends at the reading source's advertised end and looks back at most 30 days, including the fixed simulation's dates. A complete 10 AM–10 AM frame supplies the median 10 AM–6 PM background and the following 6 PM–10 AM search window. Missing hours exclude that frame rather than becoming zero consumption. A proposed step must have at least four contiguous hours, a median magnitude within ±30% of the entered aircon's aggregate kW, and hourly excess within ±30% of its own median. The step must begin and end inside the search window; multiple sustained steps or unstable overlapping loads are excluded.

At least seven nights must share the same window, covering at least 70% of complete frames. Daily temperatures are joined by Manila date across midnight and averaged over the proposed hours. At least seven paired nights, at least 1°C of heat variation, a slope of at least 0.02 kW/°C, and correlation of at least 0.5 are required. These are project heuristics for a tentative question, not validated appliance identification. Daily heat is independently injectable through `DAILY_WEATHER_SOURCE`; its default mock uses the same invented climate as the simulated readings. Synthetic readings are never paired with observed weather.

In the smart Household's appliance survey, add one aircon to see **“Aircon ba ito?”** when evidence supports a proposal. **Oo** fills the returned window into the local routine editor. **Hindi** opens manual routine questions without adopting the proposal. Use the existing **I-save** action to persist. Previously entered or saved routines stay intact; **Tingnan ang pattern sa smart meter** explicitly requests a new suggestion. Multiple aircon cards use individual manual routines because attribution would be ambiguous. Missing evidence and reading failures leave manual entry usable. The current readings and temperatures are labeled as simulated.

Changing the rating answers, quantity, or confirmed label cancels an outstanding suggestion. Card removal, Household/session changes, logout, and manual entry also cancel it; delayed results are ignored. The traditional-meter Bill History proposal, Bill calibration, Missions, and Points keep their existing behavior. Tests use independent reading and daily-weather fakes and exercise confirmation/save/reopen, rejection/manual entry, errors, expiry, and delayed-response isolation. No database migration or new network service is required.

### Scan linkage

A successful public `POST /api/bills/scan` now includes `scanToken`, an opaque reference valid for fifteen minutes. Only the normalized Service ID Number is retained server-side, with a maximum of 1,000 active references; no photo or scanned Bill is saved. Complete ten-digit identifiers are required for matching; whitespace and hyphens are accepted. Missing or partial identifiers cannot identify a Household.

- `POST /api/bills/scan-linkage` `{ scanToken }`, with `Authorization: Bearer <login token>`, returns `{ status: "linked", householdSin }`, `{ status: "unlinked" }` or `{ status: "unknown" }`.
- Matching uses the full identifier and the current login's linked Households, never a masked suffix or a client-supplied SIN. Invalid input returns 400; missing/expired login returns 401; expired or unknown references return the same 404. A scan reference cannot be used as a login token.
- The PWA resolves linkage after the existing “Tama ba?” confirmation, including when login happens after the scan. Unlinked Bills keep their quick verdict with “Hindi naka-link ang account na ito sa My Meralco mo.” A linked scan offers its matching Household explicitly; it never automatically saves or assigns a Bill. Choosing another linked Household in the picker separately opens that Household's own history.
- `pnpm test` runs the backend HTTP suite plus frontend DOM tests for login, stale responses, Household switching, logout, expiry, errors and scan linkage. Manual browser verification requires a connected browser.
