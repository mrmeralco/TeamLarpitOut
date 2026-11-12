# Completing Household Setup earns Welcome Points that stay locked until the first Verified Savings

> **Setup contents updated** by [ADR-0006](0006-setup-by-tapping-appliances-and-one-routine.md) on 2026-11-12: setup is now household info, an appliance tap grid and one routine. The Welcome Points rule below is unchanged; setup now starts from the Missions tab after "Want to save on your next bill?".

Most users skip optional prompts, so an opt-in "Gusto mo bang ma-reward?" question in front of the appliance setup would send most households past it, and without appliances there are no Missions and no Points. We want about 90% of households to reach Manage your usage, so setup itself is rewarded: a household that finishes **Household Setup** (who lives there and when the house is occupied, the aircon by label scan or visual questions, and a confirmation of the aircon hours) gets **Welcome Points** once. They show in the balance at once but are **locked**: they unlock only when the Household earns its first Verified Savings. Setup is shown as a checklist on Home ("Simulan: 2/3 · +100 pts") and the Missions screen stays locked behind it, never as a dialog that can be dismissed.

This keeps the rule that Points come from saved kWh: no Reward can be redeemed on setup alone, while the locked balance pulls the household both into setup and back at the next Bill. Welcome Points are granted once per Household, not per login, even when several logins share it.

## Considered Options

- **Opt-in question before appliances**: honest, but most users dismiss it and never reach Missions.
- **Points for setup, spendable at once**: strongest pull, but easy to farm with new accounts, partners would pay for savings that never happened, and it breaks "Points only from Verified Savings" in front of the judges.
- **No reward for setup, only a locked Missions screen**: no farming risk, but nothing makes the extra steps feel worth it.

## Consequences

- Points and Rewards now cover a second, non-savings source; it is capped (one grant per Household) and cannot be spent before the first Verified Savings.
- Only the aircon is required; other appliances are optional and fall back to defaults, since calibration to the Bill's kWh keeps the total right.
- Setup asks only what the computations use (household size, home hours, appliances); no other personal information.
- The amount (100 pts, against a cheapest sample Reward of 500 pts) is a starting value to tune, not a commitment.
- Built after Points (#17) and the Points ledger in Rewards (#19) land in TeamLarpitOut, not before.
