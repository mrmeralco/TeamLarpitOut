# KuryenteKo

Helps a household understand its Meralco bill, see why it changed, check that the bill is consistent with Meralco's own records, and act to lower the next one, using the monthly bill everyone already has. KilosWatt is the name of its usage-management part (Target, Missions, Savings).

## The bill

**Bill**:
One billing period's statement for one Household: kWh used, billing days, period, and every charge line.
_Avoid_: Statement, invoice, SOA

**Per-kWh Charge**:
A bill line priced per kWh used (generation, transmission, system loss, distribution, subsidies, and the VAT on them). Using less lowers it.
_Avoid_: Variable charge, rate

**Fixed Charge**:
A bill line charged per customer per month regardless of kWh used (e.g. metering and supply charges). Using less does not lower it.
_Avoid_: Flat fee, basic charge

**Pass-through Charge**:
A Per-kWh Charge that Meralco collects for someone else and does not earn from, chiefly generation and transmission. Distribution is the part Meralco keeps.
_Avoid_: Meralco's charges

**Household**:
One Meralco service, linked to a login by its Customer Account Number. Appliances, Missions, readings and Points belong to a Household, not to a login.
_Avoid_: Account, home, user

**Customer Account Number (CAN)**:
The number printed on the Bill that a person types to link a Household. Typing it shows only a masked summary; the link activates when a scanned Bill shows the same CAN. See ADR-0005.
_Avoid_: Account ID, reference number

**Service ID Number**:
Meralco's identifier for one service, also printed on the Bill. KuryenteKo links by CAN, not by Service ID Number.
_Avoid_: Account number, reference number

**Sign-in**:
Email address plus a 6-digit code sent to that email; no password. The email is not tied to any Meralco account. One owner (login) per Household.
_Avoid_: My Meralco login, user account, profile

**Account Linking**:
Typing a CAN, then scanning a Bill that shows the same CAN. Only then does the Household's Bill History unlock for that login.
_Avoid_: Registration, verification

**Meter Type**:
Whether a Household has a traditional meter (read monthly, known only through Bills) or a smart meter (interval readings: hourly, daily, weekly). Comes from Meralco's record, never from the household.
_Avoid_: Customer type, plan, account type

**Bill History**:
The previous Bills of one Household, normally the last 12.
_Avoid_: Past bills, records

**Rate Schedule**:
Meralco's published per-kWh and fixed charges for one billing month, including consumption tiers and the lifeline discount.
_Avoid_: Rate, tariff, price

## Why the bill changed

**Bill Change**:
The peso difference between this Bill and the previous one, split exactly into Rate Effect, Billing Days Effect, Weather Effect, and Habit Effect.
_Avoid_: Increase, bill shock

**Rate Effect**:
The part of the Bill Change caused by the Rate Schedule changing, holding kWh fixed. The household cannot control it.
_Avoid_: Price effect

**Billing Days Effect**:
The part of the Bill Change caused by the billing period being longer or shorter, at the previous kWh per day.
_Avoid_: Days effect, period effect

**Weather Effect**:
The estimated part of the Bill Change caused by hotter or cooler weather acting on the household's Cooling Appliances. Can be negative.
_Avoid_: Heat effect, heat share

**Habit Effect**:
Whatever remains of the Bill Change after the other three effects: the part the household's own behaviour drove. Can be negative.
_Avoid_: Behavior share, usage effect, intensity effect

**Bill Check**:
A comparison between Meralco's own documents only (the Bill's lines vs. its total, its previous reading vs. the last Bill's present reading, its rates vs. the published Rate Schedule, its balance vs. payments made). Never a comparison against an app estimate.
_Avoid_: Audit, verification, dispute check

**Unexplained Difference**:
A failed Bill Check: a gap of more than a few pesos between two of Meralco's own figures. Shown as something worth asking Meralco about; the app never files or judges it.
_Avoid_: Error, discrepancy, dispute, complaint

**Usage Outlier**:
A Habit Effect far above what the household's Bill History predicts for the same weather and billing days. Prompts "May nagbago ba sa bahay?"; it is never treated as a sign the Bill is wrong.
_Avoid_: Unexplained usage, suspicious bill, anomaly

**Heat Sensitivity**:
How many extra kWh per day a household uses for each additional cooling degree day, learned from its own Bill History. Drives the Weather Effect when history exists.
_Avoid_: Weather factor, heat factor

**Cooling Appliance**:
An appliance whose usage rises with heat, chiefly aircons and electric fans.

## Targets and results

**Baseline**:
The kWh the household would be expected to use this billing period, from the previous Bill's kWh per day adjusted for weather and billing days.
_Avoid_: Normal usage, average

**Target**:
The Baseline reduced by 5%, shown in kWh and pesos as "use 5% less electricity". See ADR-0007.
_Avoid_: Budget

**Savings**:
The pesos between what the Baseline would have cost and the actual Bill. Can be negative.
_Avoid_: Points, reduction

**Mission**:
One concrete habit change from a fixed catalog, carrying a kWh and peso value and a share of the 5% Target, computed from the household's own appliance estimate. On a traditional meter a Mission lasts one billing period and is verified by the next Bill; on a smart meter it can last a day or a week and is verified by interval readings.
_Avoid_: Challenge, quest, tip

**Mission Plan**:
Up to five Missions, mixed across appliances, that together reach about the 5% Target. Code computes the candidates; the AI picks and words the plan and can shuffle it or swap one Mission. See ADR-0007.
_Avoid_: Mission list, recommendations

**Verified Savings**:
kWh below the weather- and billing-days-adjusted Baseline, measured from a Bill or from smart meter readings, never from the household's own report. Periods with a brownout are excluded.
_Avoid_: Self-reported savings, completed mission

**Points**:
The household's reward balance, earned from Verified Savings, plus one grant of Welcome Points that stays locked until the first Verified Savings.
_Avoid_: Credits, coins, score

**Household Setup**:
The one-time onboarding a household completes before Missions: household info, a tap grid of the appliances it has, and one routine for the whole home (when someone is home, when the aircon is on). Shown as the locked state of the Missions tab. See ADR-0006.
_Avoid_: Profile, onboarding mission

**Welcome Points**:
Points granted once per Household for finishing Household Setup, visible at once but locked until the Household's first Verified Savings. See ADR-0004.
_Avoid_: Signup bonus, free points

**Reward**:
A partner-funded item (load, e-wallet credit, voucher) a household gets by spending Points. Never a discount on the Meralco Bill.
_Avoid_: Prize, rebate, bill credit

## During the month

**Mid-month Reading**:
A cumulative meter reading taken partway through a billing period, typed by the household or delivered by a smart meter.
_Avoid_: Interim bill, check-in

**Forecast**:
The projected next Bill: a peso range from Bill History, the weather forecast, and the latest Rate Schedule, narrowed to a single figure once a Mid-month Reading exists.
_Avoid_: Estimate, prediction, projection
