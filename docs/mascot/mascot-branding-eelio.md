# Mascot & Brand Identity: Eelio

## 1. Brand Name & Meaning: **Eelio**

To directly address **Challenge #2: Know Your Bill, Manage Your Usage** ([official_challenges.png](../official-documents/official_challenges.png)), the project and its companion mascot are unified under a single name: **Eelio**.

| Element | Meaning & Wordplay | How It Connects to Challenge #2 |
| :--- | :--- | :--- |
| **Eel** | Nature's living battery (an electric eel that senses its surroundings with low-voltage pulses and manages its stored charge) | **Know Your Bill & Manage Your Usage:** Uses electric pulses to "see" in the dark (bill clarity) while conserving its own energy (usage management). |
| **Elio / Ilaw** | Derived from *Helios* (light/energy) and Tagalog *Ilaw* (light/clarity) | Shines light on the 20 confusing sections of a residential electricity bill. |
| **-io / Iyo** | *"Para sa iyo"* (For you) | Personalizes household bill decoding and daily energy-saving Missions. |

> **Unified Brand Identity:**
> - **Project & App Name:** **Eelio**
> - **Mascot Companion Name:** **Eelio**
> - **Core App Shell (Issues #48–#53):** **Home** (Bill Breakdown & Charge Chat) · **Missions** (5% Mission Plan, Appliance Tap Grid & Routine) · **Rewards** (Verified Savings & Points) · **Account** (CAN Linking)

![Eelio Official Brand Mascot](eelio-dressed-hero.jpg)

---

## 2. Visual Anatomy & UI Theme Alignment (`GABlane/Larp-Ui-Ux`)

**Eelio** features the sleek, graceful **S-curve silhouette of an electric eel** with an approachable, expressive face. It keeps its natural **Electric Blue & Light Aqua** body with glowing golden lightning stripes ([eelio-reference.png](eelio-reference.png)) and wears a sporty **baseball cap and sweater-vest** tailored to the exact Tailwind UI tokens from `GABlane/Larp-Ui-Ux`:

| UI Token (`tailwind.config.js`) | Hex Value | Application on Eelio Mascot & Outfit |
| :--- | :--- | :--- |
| **Natural Eel Body** | Electric Blue & Aqua | Sleek S-curve electric eel body with soft aqua underbelly (complementary contrast against the warm UI canvas) |
| **`brand.DEFAULT` / `brand.hover`** | `#C2500C` / `#A84308` | Burnt-orange / terracotta baseball cap & sporty sweater-vest |
| **`info.DEFAULT`** | `#0F6E68` | Deep teal ribbed collar and hem trim on Eelio's vest |
| **`brand.soft` / `canvas`** | `#FDEEE3` / `#FAF6F0` | Warm cream armholes, cap lightning emblem, and `#FAF6F0` background canvas |
| **`ink.DEFAULT`** | `#1F1B16` | Warm espresso eyes, detective glasses frames, and typography |
| **`warn` / Amber Glow** | `#F59E0B` / `#FDF3DC` | Glowing golden lightning-bolt lateral line (living battery gauge) |

---

## 3. How Eelio Solves Challenge #2 (UX, Psychology & Anti-Mañana Gamification)

In [know-your-bill-official.md](../kyb/know-your-bill-official.md), residential customers face 20 numbered sections across the front and back of the Meralco bill, leading to cognitive overload and the **Mañana Habit** (*"Bukas na lang kami magtitipid"*).

Eelio counters both problems through **3 Gamified States**:

![Eelio 3 Gamified Expressions](eelio-dressed-expressions.jpg)

| Mascot State | Trigger in the App | Visual Expression | Psychological / UX Purpose |
| :--- | :--- | :--- | :--- |
| **1. Fully Charged Eelio** (*Manage Your Usage — Missions & Rewards Tabs*) | Household completes their 5% Mission Plan & earns Verified Savings Points | Floating in an energetic S-curve, bright golden lightning stripes sparking along its sides | Positive reinforcement that rewards verified energy-saving habits and keeps momentum going. |
| **2. Bill Detective Eelio** (*Know Your Bill — Home Tab & Charge Chat*) | User links their CAN, scans their Meralco bill, or taps a charge line to ask a question | Wearing round espresso-framed glasses, holding a magnifying glass beside the bill's kWh chart | Replaces cognitive overload with a clear, friendly 4-way breakdown (Rate, Billing Days, Weather, and Habit Effects) and stateless charge explanations. |
| **3. Low-Battery Eelio** (*Anti-Mañana Nudge*) | Household has not completed setup or is trending above their 5% Mission Plan forecast | Curled up in a cozy coil with its cap tilted over sleepy eyes, dimmed lightning stripes, and a 10% battery icon | Gentle visual reminder that prompts the household to act *today* rather than waiting for next month's bill shock. |
