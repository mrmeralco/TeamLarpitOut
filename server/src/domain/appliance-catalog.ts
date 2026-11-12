/**
 * The appliances a household can add, the visual questions asked for each,
 * and the typical power figures those answers select.
 *
 * Power figures are TYPICAL values in the range of Meralco's appliance
 * calculator; confirm them against the calculator before the demo.
 * "Hindi ko alam" (or no answer) falls back to the type's default.
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
  | "rice_cooker";

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
  /** "Hindi ko alam" is always offered on top of these. */
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
  { value: "yes", label: "Oo" },
  { value: "no", label: "Hindi" },
];

const pick = <T extends string>(value: string, table: Record<T, number>): number | null =>
  value in table ? table[value as T] : null;

export const APPLIANCE_CATALOG: ApplianceDefinition[] = [
  {
    type: "aircon",
    label: "Aircon",
    routine: "timeRanges",
    questions: [
      { key: "mount", label: "Split o window type?", options: [{ value: "split", label: "Split" }, { value: "window", label: "Window" }] },
      { key: "inverter", label: "May nakasulat bang \"Inverter\"?", options: YES_NO },
      {
        key: "room",
        label: "Gaano kalaki ang kwarto?",
        options: [
          { value: "small", label: "Maliit (kwarto)" },
          { value: "medium", label: "Katamtaman" },
          { value: "large", label: "Malaki (sala)" },
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
      { key: "inverter", label: "Inverter ba ang ref?", options: YES_NO },
      {
        key: "size",
        label: "Gaano kalaki?",
        options: [
          { value: "small", label: "Maliit (isang pinto)" },
          { value: "large", label: "Malaki (dalawang pinto)" },
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
      { key: "kind", label: "Anong klase?", options: [{ value: "stand", label: "Stand o desk" }, { value: "ceiling", label: "Ceiling" }] },
    ],
    rating: ({ kind }) => pick(kind!, { stand: 0.06, ceiling: 0.075 }),
    defaultRating: 0.065,
  },
  {
    type: "tv",
    label: "TV",
    routine: "timeRanges",
    questions: [
      { key: "size", label: "Gaano kalaki?", options: [{ value: "small", label: "32 pulgada pababa" }, { value: "large", label: "Mas malaki sa 32" }] },
    ],
    rating: ({ size }) => pick(size!, { small: 0.06, large: 0.12 }),
    defaultRating: 0.09,
  },
  {
    type: "lights",
    label: "Mga ilaw",
    routine: "timeRanges",
    questions: [
      {
        key: "count",
        label: "Ilang ilaw ang sabay na bukas?",
        options: [
          { value: "few", label: "1–4" },
          { value: "some", label: "5–9" },
          { value: "many", label: "10 o higit pa" },
        ],
      },
      { key: "led", label: "LED ba ang mga ilaw?", options: YES_NO },
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
      { key: "kind", label: "Anong klase?", options: [{ value: "twin_tub", label: "Twin tub" }, { value: "automatic", label: "Automatic" }] },
    ],
    rating: ({ kind }) => pick(kind!, { twin_tub: 0.4, automatic: 0.6 }),
    defaultRating: 0.5,
  },
  {
    type: "flat_iron",
    label: "Plantsa",
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
    questions: d.questions.map((q) => ({ ...q, options: [...q.options, { value: UNKNOWN, label: "Hindi ko alam" }] })),
  }));
}
