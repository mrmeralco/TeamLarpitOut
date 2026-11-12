/**
 * The appliances a household can add, the visual questions asked for each,
 * and the typical power figures those answers select.
 *
 * Power figures are TYPICAL values in the range of Meralco's appliance
 * calculator; confirm them against the calculator before the demo.
 * "I don't know" (or no answer) falls back to the type's default.
 */

export type ApplianceType =
  | "aircon"
  | "refrigerator"
  | "wifi"
  | "electric_fan"
  | "tv"
  | "lights"
  | "washing_machine"
  | "flat_iron"
  | "rice_cooker"
  | "computer"
  | "other";

/** How hours of use are asked: never as hours, always as a routine. */
export type RoutineKind = "alwaysOn" | "timeRanges" | "usesPerWeek";

export const UNKNOWN = "unknown";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface VisualQuestion {
  key: string;
  label: string;
  /** "I don't know" is always offered on top of these. */
  options: QuestionOption[];
}

export interface ApplianceDefinition {
  type: ApplianceType;
  label: string;
  routine: RoutineKind;
  questions: VisualQuestion[];
  /**
   * The rating the answers select: kW while running (timeRanges), kWh per use
   * (usesPerWeek), or kWh per day (alwaysOn). Unanswered questions are passed
   * as UNKNOWN; return null to fall back to `defaultRating`.
   */
  rating: (answers: Record<string, string>) => number | null;
  defaultRating: number;
}

const YES_NO: QuestionOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const pick = <T extends string>(value: string, table: Record<T, number>): number | null =>
  value in table ? table[value as T] : null;

export const APPLIANCE_CATALOG: ApplianceDefinition[] = [
  {
    type: "aircon",
    label: "Aircon",
    routine: "timeRanges",
    questions: [
      { key: "mount", label: "Split or window type?", options: [{ value: "split", label: "Split" }, { value: "window", label: "Window" }] },
      { key: "inverter", label: "Does it say \"Inverter\"?", options: YES_NO },
      {
        key: "room",
        label: "How big is the room?",
        options: [
          { value: "small", label: "Small (bedroom)" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large (living room)" },
        ],
      },
    ],
    rating: ({ mount, inverter, room }) => {
      const size = pick(room!, { small: 0.75, medium: 1.1, large: 1.6 });
      if (size === null && mount === UNKNOWN && inverter === UNKNOWN) return null;
      const base = size ?? 1.1;
      const windowFactor = mount === "window" ? 1.1 : 1;
      const inverterFactor = inverter === "yes" ? 0.7 : 1;
      return base * windowFactor * inverterFactor;
    },
    defaultRating: 1.0,
  },
  {
    type: "refrigerator",
    label: "Refrigerator",
    routine: "alwaysOn",
    questions: [
      { key: "inverter", label: "Is the ref an inverter?", options: YES_NO },
      {
        key: "size",
        label: "How big?",
        options: [
          { value: "small", label: "Small (one door)" },
          { value: "large", label: "Large (two doors)" },
        ],
      },
    ],
    rating: ({ inverter, size }) => {
      const bySize = pick(size!, { small: 0.9, large: 1.4 });
      if (bySize === null && inverter === UNKNOWN) return null;
      return (bySize ?? 1.1) * (inverter === "yes" ? 0.65 : 1);
    },
    defaultRating: 1.1,
  },
  {
    type: "wifi",
    label: "Wi-Fi router",
    routine: "alwaysOn",
    questions: [],
    rating: () => null,
    defaultRating: 0.24,
  },
  {
    type: "electric_fan",
    label: "Electric fan",
    routine: "timeRanges",
    questions: [
      { key: "kind", label: "What kind?", options: [{ value: "stand", label: "Stand or desk" }, { value: "ceiling", label: "Ceiling" }] },
    ],
    rating: ({ kind }) => pick(kind!, { stand: 0.06, ceiling: 0.075 }),
    defaultRating: 0.065,
  },
  {
    type: "tv",
    label: "TV",
    routine: "timeRanges",
    questions: [
      { key: "size", label: "How big?", options: [{ value: "small", label: "32 inches or smaller" }, { value: "large", label: "Bigger than 32 inches" }] },
    ],
    rating: ({ size }) => pick(size!, { small: 0.06, large: 0.12 }),
    defaultRating: 0.09,
  },
  {
    type: "lights",
    label: "Lights",
    routine: "timeRanges",
    questions: [
      {
        key: "count",
        label: "How many lights are on at the same time?",
        options: [
          { value: "few", label: "1–4" },
          { value: "some", label: "5–9" },
          { value: "many", label: "10 or more" },
        ],
      },
      { key: "led", label: "Are the lights LED?", options: YES_NO },
    ],
    rating: ({ count, led }) => {
      const bulbs = pick(count!, { few: 3, some: 7, many: 12 });
      if (bulbs === null && led === UNKNOWN) return null;
      return (bulbs ?? 6) * (led === "no" ? 0.02 : 0.01);
    },
    defaultRating: 0.06,
  },
  {
    type: "washing_machine",
    label: "Washing machine",
    routine: "usesPerWeek",
    questions: [
      { key: "kind", label: "What kind?", options: [{ value: "twin_tub", label: "Twin tub" }, { value: "automatic", label: "Automatic" }] },
    ],
    rating: ({ kind }) => pick(kind!, { twin_tub: 0.4, automatic: 0.6 }),
    defaultRating: 0.5,
  },
  {
    type: "flat_iron",
    label: "Flat iron",
    routine: "usesPerWeek",
    questions: [],
    rating: () => null,
    defaultRating: 1.0,
  },
  {
    type: "rice_cooker",
    label: "Rice cooker",
    routine: "usesPerWeek",
    questions: [],
    rating: () => null,
    defaultRating: 0.35,
  },
  {
    type: "computer",
    label: "Computer",
    routine: "timeRanges",
    questions: [
      { key: "kind", label: "What kind?", options: [{ value: "laptop", label: "Laptop" }, { value: "desktop", label: "Desktop" }] },
    ],
    rating: ({ kind }) => pick(kind!, { laptop: 0.05, desktop: 0.15 }),
    defaultRating: 0.1,
  },
  {
    type: "other",
    label: "Other",
    routine: "timeRanges",
    questions: [],
    rating: () => null,
    defaultRating: 0.05,
  },
];

export function findAppliance(type: string): ApplianceDefinition | undefined {
  return APPLIANCE_CATALOG.find((d) => d.type === type);
}

/** The catalog as the PWA needs it (no functions). */
export function catalogForClient() {
  return APPLIANCE_CATALOG.map((d) => ({
    type: d.type,
    label: d.label,
    routine: d.routine,
    questions: d.questions.map((q) => ({ ...q, options: [...q.options, { value: UNKNOWN, label: "I don't know" }] })),
  }));
}
