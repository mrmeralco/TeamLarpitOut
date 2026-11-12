# Missions are a plan to use 5% less electricity, mixed across appliances and picked by AI from computed candidates

The household's goal for a billing period is **use 5% less electricity** than its weather- and days-adjusted Baseline (shown as kWh and pesos, e.g. "about 31 kWh, or ~₱341"). Missions are the steps toward that goal and are not limited to the aircon: code computes every candidate Mission the household's appliances and routine allow (aircon off an hour earlier, iron once a week, ref at medium, lights off in empty rooms, unplug standby devices, full laundry loads…), each with its kWh, pesos and share of the goal. The AI then picks a **Mission Plan** of up to five that together reach about 5%, writes each one in plain words for this home, and can **shuffle** to another combination or **swap** one Mission. The Missions tab shows the goal, how much of it the plan covers, and the Missions; a Mission's detail shows its share of the goal, peso value, effort, why it fits this home, and how to do it.

Points stay on the whole Bill: at the next Bill, Verified Savings below the Baseline become Points (1 point per ₱1), whichever Missions were done. Per-Mission figures are estimates that explain where the 5% can come from.

We chose this because the team wants the message "save 5% by doing these few things" rather than a list of aircon tips, households differ (some have no aircon), and AI variation makes the plan feel personal. Keeping the numbers in code preserves the plan's rule that the AI only phrases and selects; it never invents a figure.

## Considered Options

- **Ranked Missions by peso value, pick one to three (previous plan)**: simple, but in most homes the top three are all aircon.
- **Let the AI propose Missions and values freely**: most varied, but values cannot be defended and may not add up to the goal.
- **Fixed 5% plan per appliance mix, no AI**: predictable, but every similar home gets the same text.

## Consequences

- The Target is fixed at 5% by default (the 5 / 10 / 15% choice can return later as a setting).
- The AI receives only computed candidates and returns their ids plus wording; the server rejects any plan whose ids are not candidates, then falls back to a deterministic pick.
- Smart meter Households get the same plan. ~~Verified at the next Bill like traditional ones.~~ They earn Points every day instead, from whole-day savings ([ADR-0008](0008-smart-meter-earns-daily-points.md)); per-Mission window checks stay future work.
- Candidate rates without a source (`r_temp`, `r_batch`, `r_ref`, standby watts) stay labelled as assumptions.
