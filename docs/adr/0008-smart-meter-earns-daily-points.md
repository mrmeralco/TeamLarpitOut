# Smart meter Households earn Points every day from whole-day savings, and the Bill gives them none

Partly supersedes [ADR-0007](0007-missions-as-a-five-percent-plan.md) (Points at the next Bill for smart meters) and the deferral of #18.

A traditional Household only learns whether it saved when the next Bill arrives, so its Points stay monthly. A smart meter Household has hourly readings, and waiting a month to reward it wastes the one thing that makes the meter useful: quick feedback. So a smart meter Household earns **daily Points**. Every complete Asia/Manila day after it started Missions is compared with what it would be expected to use at that day's heat, and **1 point per ₱1** saved is added the next day. The Bill no longer gives a smart meter Household any Points. Traditional Households are unchanged: Points at the next Bill.

How a day is counted:

- **Expected use** comes from the 28 complete days before the Household first started Missions: a least-squares line of kWh per day against cooling degree days (base 22 °C, as for monthly weather). A hot day raises the expectation; a cool day lowers it. At least 7 complete reference days are needed.
- **Whole day, not per Mission.** The day's total kWh is compared, whichever Missions were done, as the Bill is for traditional Households. No appliance has to be identified.
- **Price** is the sum of the per-kWh charges on the latest Bill's Rate Schedule, the same rate the Missions' peso values use.
- **Not counted:** the day Missions started (part of it came before), today (still running), days with any missing hour or no temperature (they wait; missing hours are never zero use), and days with a recorded outage (0 points). An outage record with no date excludes every day of its month.
- **Start date** is kept across shuffles, swaps and new periods (`startedAt` on the plan), so saved days never become the reference.
- Each day is settled once (one ledger entry per Household per day) and is never revised.

## Considered Options

- **Per-Mission time windows (#18 as written)**: e.g. 4–6 AM below base load. Shows which Mission saved, but needs a window per Mission, leaves "monthly only" Missions at the Bill, and can pay for a window while the rest of the day used more.
- **Daily Points plus a Bill true-up**: daily Points as an advance, the Bill pays any shortfall. Matches the Bill exactly, but adds a second rule to explain; the team chose daily only.
- **Bill only (previous plan)**: simplest and one rule for everyone, but no faster feedback for smart meter homes.

## Consequences

- Points for a smart meter Household can differ from what its Bill would have given: the daily price is a flat per-kWh rate without tiers or lifeline, and days without data earn nothing. This is accepted for the faster feedback.
- The first daily savings unlock Welcome Points ([ADR-0004](0004-setup-earns-locked-welcome-points.md)), as the first Bill savings do.
- The reference stays the 28 days before the first start. A household whose habits drift over many months is still compared with that start, adjusted only for heat.
- The demo smart meter simulates a household that follows its current plan: after Missions start, each Mission lowers the readings by its own kWh per day (its `kwhSaved` over the days in the plan's period), in the hours it applies to — the aircon's last hours, the evening, or the whole day for the ref, iron and laundry (labelled simulated). A plan without an aircon Mission saves nothing on the simulated aircon. The base simulated household (an aircon at night, evening use) stays the same whatever appliances were entered.
- The ledger has a `meter_verified` source with a `day`; the database allows one per Household per day.
