# Without login, the Bill-only Verdict stops at the Rate and Billing Days Effects

> **Superseded** by [ADR-0005](0005-email-otp-sign-in-and-can-linking.md) on 2026-11-12: sign-in now comes first, so every scan gets the full Bakit ganito?.

Anyone can scan a Bill without logging in, but what they get is the **Bill-only Verdict**: the Bill Change, its Rate Effect and Billing Days Effect, Bill Checks 1 and 3, and the redrawn Bill. The rest of the change (Weather Effect + Habit Effect) is shown as one ❓ amount: "Init ba o gamit ninyo? Mag-login gamit ang My Meralco para malaman." The team worried that a full no-login explanation makes KilosWatt pointless, since people could stop at "explain my bill". The line is not artificial: separating Weather from Habit needs Heat Sensitivity from the 12-bill Bill History, which only login provides, so the Bill-only Verdict stops where one Bill stops being able to answer. The Habit Effect, revealed after login, is then the bridge into Missions ("₱577 dahil sa gamit. Gusto mo bang mabawasan?").

## Considered Options

- **Full Bakit ganito? without login** (previous plan): best first impression, but the explanation becomes the whole product and nothing pulls people into Missions and Points.
- **Login required before any scan**: protects the funnel, but an upset customer facing a login form leaves, and forcing login does not make someone who only wants an explanation do Missions.

## Consequences

- Renters without a My Meralco account can still split Weather vs. Habit through a small "Wala akong My Meralco account" link (second Bill upload + aircon survey), with nothing saved and no Missions or Points.
- The Bill-only Verdict needs last month's kWh and billing days from the Bill itself; if Meralco's bill does not print them, it falls back to the redrawn Bill and Bill Checks 1 and 3.
