# Split the Bill Change by recomputing the whole bill, with weather from the household's Heat Sensitivity

The decoder does not multiply kWh by a single "rate". It rebuilds each Bill from a table of the month's Rate Schedule (Per-kWh Charges, Fixed Charges, lifeline) with one `cost(kwh, days, schedule)` function, and splits the Bill Change by swapping one input at a time: Rate Effect = `cost(kwh_now, schedule_now) − cost(kwh_now, schedule_before)`, Billing Days Effect from the previous kWh per day, Weather Effect = Heat Sensitivity (kWh/day per cooling degree day, fitted on the household's 12-bill Bill History) × (CDD_now − CDD_before) × days at the previous schedule, falling back to Cooling Appliance kWh per day × days × (CDD_now / CDD_before − 1) when there is no Bill History, and Habit Effect as the remainder, which may be negative. We chose this because "the parts always add up to the real change" is the product's core claim, and only a full recomputation keeps it exact once Fixed Charges, the lifeline discount, or any tiered charge are involved; learning weather from the household's own history (or, failing that, its Cooling Appliance estimate) replaces an undefined heat factor with a method we can defend to judges.

## Considered Options

- **Single blended rate (bill ÷ kWh)**: simplest, but Fixed Charges leak into the Rate Effect and the sum is no longer exact.
- **Generic heat factor on total kWh**: no defensible source for the factor, and it treats the refrigerator and the aircon as equally heat-sensitive.
- **Clamping the Weather Effect to the usage increase** (the original `min(...)`): produces a positive Habit Effect when usage actually fell.

## Consequences

- With Bill History, the appliance survey is not needed for the Weather Effect and moves after the verdict; only the bill-only fallback path needs it first.
- A Rate Schedule table is needed for every month a decoded Bill falls in. When `cost()` does not reproduce a Bill's actual total, that gap is surfaced to the user as an Unexplained Difference rather than absorbed into the Habit Effect. A large Habit Effect is a Usage Outlier, never evidence the Bill is wrong.
