# Sign in with an email code, link the Household by its CAN, and prove it with the scanned Bill

> **Updated 2026-11-12** to follow the agreed mockup (like the My Meralco app): sign up asks for email + contact number, sends a one-time code by SMS (or email), then emails a verification link where the person creates their own password; returning users sign in with email + password. There is no CAN screen: the CAN is read from the scanned Bill and linked when the person confirms the scan. The ownership check (only someone holding the Bill can link it) is unchanged.

KuryenteKo now uses a standard consumer sign-in: the person types an email address and receives a 6-digit code; there is no password and no "Login with My Meralco". The email is not tied to any Meralco account. After signing in, the person links a Household by typing its **Customer Account Number (CAN)** and then scans their latest Bill; the link only becomes active, and the 12-bill Bill History only unlocks, when the scanned Bill shows the same CAN. Every signed-in person therefore gets the full Bakit ganito? (all four effects) on their first scan, and the no-login Bill-only Verdict is dropped. This supersedes [ADR-0003](0003-bill-only-verdict-stops-at-rate-and-days.md) and the "Login with My Meralco" decision in the plan.

We chose this because the team wants one familiar sign-in that works for anyone, including people who never registered on My Meralco, and because a full explanation right after sign-in is a better first impression than a partial answer with a ❓. The scanned Bill is the ownership check: anyone can type a CAN, but only someone holding that Household's latest Bill can unlock its history.

## Considered Options

- **Login with My Meralco (previous plan)**: Households arrive already linked, but it shuts out people without a My Meralco account and is a mock the judges know we cannot ship.
- **OTP to the mobile number Meralco has on file for the scanned account**: strong ownership check, but it needs Meralco's contact record, which a consumer app does not have.
- **Email code + CAN, no bill check**: simplest, but anyone could read a neighbour's 12-month history by typing their CAN.

## Consequences

- Before the scan matches, CAN lookup returns only a masked summary (area, Meter Type, number of Bills on record), never amounts or kWh.
- Smart meter Households follow the same rule: one Bill scan to prove the CAN, then readings load.
- Sending codes needs an email service; the demo uses a mock sender that logs the code and accepts a fixed code in test mode.
- A Household is still owned by one login. A second login that scans the same CAN is refused with a message to contact the owner (no sharing in the demo).
- Renters without access to the Bill cannot link; the "Wala akong My Meralco account" path and the no-login scan are removed.
