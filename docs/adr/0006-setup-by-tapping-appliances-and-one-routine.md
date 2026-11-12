# Household Setup is a tap grid of appliances plus one routine for the whole home

Household Setup asks two things. First, **which appliances the home has**: a grid of common appliances (aircon, refrigerator, electric fan, TV, washing machine, rice cooker, flat iron, computer, other) where a tap adds one and another tap adds a second. No wattage, model, label or photo is required. Second, **one routine for the whole home**: when someone is usually home (almost all day / evenings and weekends / mostly daytime) and when the aircon is usually on (sleeping only / afternoon and night / most of the day). Code turns the routine into hours per appliance, typical values give kWh per hour, and the total is calibrated to the Bill's kWh as before. For traditional meters the 12-bill cooling load still estimates aircon hours and is shown as a confirmation ("Your 12 bills agree: about 8 hours a night"). Photographing the aircon is an optional shortcut for a closer size estimate, tagged "Estimated from photo".

We chose this because the per-appliance flow (label scan or visual questions, then hours, for each appliance) made setup feel long, and most households would stop before Missions. Calibration to the Bill keeps the total right whatever the per-appliance guesses, so extra questions mostly move kWh between appliances without improving what the household sees.

## Considered Options

- **Per-appliance label scan or visual questions, hours from routines per appliance (previous plan)**: more precise per appliance, but several screens per appliance.
- **Photo of each appliance, AI detects type and watts**: feels magical, but still one photo per appliance and the detected watts are guesses anyway.
- **No appliances at all, Missions from Bill History only**: fastest, but Missions could not mention the household's own appliances.

## Consequences

- Updates the setup contents in [ADR-0004](0004-setup-earns-locked-welcome-points.md); Welcome Points still unlock on the first Verified Savings.
- The existing DOE label scan stays available but is optional and no longer part of setup.
- Source tags shrink to two in the main path: "Typical value" and "Estimated from photo".
- Missions phrase their numbers as estimates ("~₱208"), since per-appliance kWh are approximate.
