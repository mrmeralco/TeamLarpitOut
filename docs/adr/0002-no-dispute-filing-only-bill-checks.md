# The app never files complaints; it only runs Bill Checks against Meralco's own figures

KuryenteKo's original brief had a dispute pack and a Meralco staff inbox, triggered whenever a bill looked wrong. We dropped both. A high bill is not evidence of a billing error, the household does not know the standards to judge it, and the app's own estimates (Weather Effect, Habit Effect, appliance breakdown) cannot be the basis for a complaint. So the only thing that can turn the "Tama ba ito?" badge red is a **Bill Check**: a comparison between two of Meralco's own figures (the Bill's lines vs. its total, its previous reading vs. the last Bill's present reading, its rates vs. the published Rate Schedule, its balance vs. payments made). When one fails, the app shows the line and a copyable summary with "Itanong kay Meralco"; the customer decides whether to contact Meralco, and nothing is filed by the app. A large Habit Effect is a **Usage Outlier** (yellow), which asks "May nagbago ba sa bahay?" and suggests Missions; it never points the customer to Meralco.

## Considered Options

- **Dispute pack + staff inbox with one-to-one comparison** (KuryenteKo's plan): strong story for Meralco, but it would route estimate-based suspicions into Meralco's queue and add a second app to build in 24 hours.
- **Treat any leftover of the Bill Change as "unexplained"**: produces false alarms on ordinary usage increases, the opposite of decongesting customer care.

## Consequences

- No staff-side screens, area map, or blackout reports in the MVP; they move to future work.
- Every red badge must name the two Meralco figures that disagree. If a check cannot name both, it is not a Bill Check.
