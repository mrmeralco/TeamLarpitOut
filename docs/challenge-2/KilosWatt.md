# KilosWatt → merged into KuryenteKo

**KilosWatt has been merged into [`KuryenteKo.md`](./KuryenteKo.md)** (grilling session, Nov 12). That is the plan the team builds from.

**KilosWatt** is now the name of the usage-management part of KuryenteKo: Target, Missions, Forecast, Points and Rewards. The exact "why it changed" split ([ADR-0001](../adr/0001-bill-change-by-recomputing-the-bill.md)) also comes from here.

**Diagrams** (Mermaid, importable into Excalidraw via *Mermaid to Excalidraw*):
- [Happy-path user flow](./KuryenteKo.md#3-happy-path-user-flow)
- [Architecture](./KuryenteKo.md#9-architecture)
- [Mission catalog](./KuryenteKo.md#25-mission-catalog) and [Points and Rewards](./KuryenteKo.md#26-points-and-rewards)

The full earlier KilosWatt plan is in git history (commit `35fb2ea`).

> Note: these sample numbers use the survey-based weather method. In KuryenteKo, weather comes from the household's Heat Sensitivity when Bill History exists; the arithmetic of the split is otherwise the same.

## Sample Numbers (illustrative only; replace with the real Bills)

**Assumed schedules:** September Per-kWh Charges ₱14.60/kWh, October ₱15.06/kWh (Meralco's published October 2026 residential rate is ₱15.0615); Fixed Charges ₱40/month both months (placeholder).

**Bills:** September 400 kWh, 30 days → ₱5,880. October 450 kWh, 31 days → ₱6,817. Bill Change **+₱937**.

**Bakit tumaas?** (survey: Cooling Appliances ≈ 42.5% of kWh; CDD up 8%)
- Rate Effect: 450 × (15.06 − 14.60) = **₱207**
- Billing Days Effect: 13.33 kWh/day × 31 = 413.3 kWh → 13.3 kWh × ₱14.60 = **₱195**
- Weather Effect: 5.67 cooling kWh/day × 31 × 0.08 = 14.1 kWh × ₱14.60 = **~₱205**
- Habit Effect: 450 − 413.3 − 14.1 = 22.6 kWh × ₱14.60 = **~₱330**
- Check: 207 + 195 + 205 + 330 = **₱937** ✓

**Saan napupunta?** (October, calibrated to 450 kWh, at ₱15.06/kWh; Fixed Charges ₱40 shown separately)

| Appliance | kWh | Share | Pesos |
|---|---|---|---|
| Aircon | 200 | 44% | ₱3,012 |
| Refrigerator | 60 | 13% | ₱904 |
| Fans and lights | 55 | 12% | ₱828 |
| Cooking (rice cooker, kettle) | 50 | 11% | ₱753 |
| TV, Wi-Fi, gadgets | 45 | 10% | ₱678 |
| Laundry and iron | 40 | 9% | ₱602 |
| **Total** | **450** | | **₱6,777** + ₱40 fixed = **₱6,817** |

**Paano bababa ang susunod?** (November, 30 days, CDD forecast 10% lower than October; October schedule used, November not yet published)
- Baseline: 8.06 × 30 + 6.45 × 30 × 0.9 = **416 kWh** (₱6,306)
- Target (5% cut): **395 kWh, ₱5,993**
- Missions: aircon at 25°C ~₱301/mo, aircon timer off at 4 AM ~₱211, unplug TV and gadgets at night ~₱60, iron once a week ~₱45
- Mid-month Reading, day 15: 190 kWh → Forecast 380 kWh, **₱5,763**, on track
- Next Bill (simulated): 390 kWh, ₱5,913 → **Savings ₱393**, Target hit ✓

**Typical bill split (Meralco bill guide):** generation 64%, distribution ~12%, transmission 8%, system loss 5%, taxes and other charges 11%.
