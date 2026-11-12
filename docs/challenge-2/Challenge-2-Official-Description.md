# Challenge #2: Know Your Bill, Manage Your Usage

> **Source:** *Meralco IDOL Hackathon 2026 Orientation (Slide 16)*  
> **Target Audience:** Ordinary Filipino Households (Non-smart meter & Smart meter users) / Meralco Customer Care

---

## 1. Official Challenge Statement

```text
How might we help customers understand what makes up their electricity bill, use their own consumption data to manage their usage.
```

---

## 2. Problem Breakdown & Context

### Why is this a challenge for Meralco and consumers?
1. **The "Bakit Ganito Kataas?" Syndrome:**
   * Utility bills arrive once a month as a single aggregated Peso amount. Consumers cannot see day-to-day impacts of appliances (e.g., aircon usage during summer months).
   * Unbundling is poorly understood: Consumers blame Meralco for rate increases, unaware that Generation and Transmission charges are pass-through costs that Meralco does not earn from.
2. **Actionability Gap:**
   * Knowing historical kWh does not translate into practical habits. Consumers need clear peso-denominated insights and forewarning before the next bill arrives.
3. **Customer Service Congestion:**
   * Seasonal heat waves drive billing inquiries and disputes, overwhelming customer hotlines and social media channels.

---

## 3. Core Pillars Required by the Prompt

| Pillar | Requirement | What It Means |
|---|---|---|
| **Understand Bill Composition** | Transparent Unbundling | Plain-language breakdown of bill line items: Generation (~55-60%), Transmission (NGCP), System Loss, Distribution (Meralco revenue), Subsidies, and Taxes. |
| **Use Consumption Data** | Data-Driven Personalization | Leveraging meter data (smart meter telemetry, historical monthly bills, or OCR-scanned analog dials) to establish baseline usage. |
| **Manage Usage** | Actionable Control | End-of-month bill forecasting, weather-indexed alerts, appliance calculators, and personalized conservation missions. |

---

## 4. Potential Solution Angles for Team LarpItOut

* **KuryenteKo Pipeline ([`KuryenteKo-Team-Pitch-Deck.pdf`](../../KuryenteKo-Team-Pitch-Deck.pdf)):**
  * **Bill & Meter OCR:** Snap photo of paper bill (PaddleOCR/Vision) to read charges, kWh, and due dates; optional analog meter dial verification to detect human reading errors or estimated billing.
  * **Weather-Indexed Forecast:** Prophet/regression forecasting combined with Open-Meteo heat wave index to warn consumers before bill shock lands.
  * **Interactive Bill X-Ray:** Tagalog/English unbundling showing exactly where every Peso goes.
  * **Pre-Checked Dispute Pack & Staff Inbox:** Standardized 1:1 evidence generation for customer care to decongest hotlines.
* **KilosWatt Demand Response ([`KilosWatt-v0-fit.md`](../idea/KilosWatt-v0-fit.md)):**
  * Daily peak missions phrased in Pesos ("Save ₱15 tonight") to actively manage consumption.

---

## 5. Judging Criteria Alignment

* **Innovation (30%):** Proactive forecasting linked to heat index, paired with structured dispute packs rather than passive tracking.
* **Functionality (25%):** Fast, reliable web/PWA experience with camera capture, OCR parser, and instant breakdown.
* **Impact (20%):** Directly addresses the top customer pain point of Meralco's 8M+ consumer base.
* **Technical Challenge (15%):** Local OCR pipeline, computer vision for meter dials, time-series forecasting algorithms, and unbundled bill calculation engine.
* **Presentation (10%):** Relatable consumer storytelling tackling real-world Filipino household budgeting pains.
