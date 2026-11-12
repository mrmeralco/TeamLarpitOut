/**
 * The climate condition of a bill period (ENSO phase), from PAGASA's ENSO advisories, and the
 * Points multiplier it sets. PAGASA (like NOAA) calls El Niño / La Niña when the sea surface
 * temperature anomaly passes ±0.5°C; strength: weak 0.5–1.0, moderate 1.0–1.5, strong > 1.5°C.
 *
 * Why a multiplier: saving is harder in hot months. Meralco reports household use rising 20–33%
 * in the hot, dry season, so a very strong El Niño month earns up to ×1.3 (no more than that
 * extra load), a weak/moderate one ×1.15. La Niña months are cooler and wetter, so some of the
 * savings come from the weather: ×0.9. The Baseline is already weather-adjusted (cooling degree
 * days); the multiplier only rewards the extra effort a hot month takes.
 */
export type EnsoPhase = "elNino" | "laNina" | "neutral";
export type EnsoStrength = "weak" | "moderate" | "strong" | null;

export interface ClimateCondition {
  period: string;
  phase: EnsoPhase;
  strength: EnsoStrength;
  /** Points multiplier for this period. */
  multiplier: number;
  label: string;
  /** Where the phase comes from. */
  source: string;
}

interface EnsoSpan { from: string; to: string; phase: EnsoPhase; strength: EnsoStrength; source: string }

/** Bill periods (YYYY-MM) by ENSO phase, from PAGASA advisories. Months not listed count as neutral. */
const ENSO_SPANS: EnsoSpan[] = [
  { from: "2025-11", to: "2026-02", phase: "laNina", strength: "weak", source: "PAGASA La Niña Advisory No. 1 (4 Dec 2025: weak La Niña threshold reached in November) to the final advisory (9 Mar 2026)" },
  { from: "2026-03", to: "2026-04", phase: "neutral", strength: null, source: "PAGASA final La Niña advisory, 9 Mar 2026: ENSO-neutral" },
  { from: "2026-05", to: "2026-08", phase: "elNino", strength: "moderate", source: "PAGASA El Niño Advisory No. 1 (9 Jun 2026: +0.5°C anomaly in May) and No. 2 (weak to moderate)" },
  { from: "2026-09", to: "2026-12", phase: "elNino", strength: "strong", source: "PAGASA climate advisory, 23 Sep 2026: very strong El Niño through Sep–Dec 2026; NOAA CPC, Oct 2026: Niño-3.4 +2.1°C" },
];

const MULTIPLIER: Record<EnsoPhase, Record<"weak" | "moderate" | "strong" | "none", number>> = {
  elNino: { weak: 1.15, moderate: 1.15, strong: 1.3, none: 1.15 },
  laNina: { weak: 0.9, moderate: 0.9, strong: 0.9, none: 0.9 },
  neutral: { weak: 1, moderate: 1, strong: 1, none: 1 },
};

function labelFor(phase: EnsoPhase, strength: EnsoStrength): string {
  if (phase === "neutral") return "Normal season";
  const name = phase === "elNino" ? "El Niño" : "La Niña";
  return strength === "strong" ? `Very strong ${name}` : strength === "moderate" ? `${name} (weak to moderate)` : `Weak ${name}`;
}

export function climateFor(period: string): ClimateCondition {
  const span = ENSO_SPANS.find((s) => period >= s.from && period <= s.to);
  const phase = span?.phase ?? "neutral";
  const strength = span?.strength ?? null;
  return {
    period,
    phase,
    strength,
    multiplier: MULTIPLIER[phase][strength ?? "none"],
    label: labelFor(phase, strength),
    source: span?.source ?? "No El Niño or La Niña advisory from PAGASA for this month: treated as a normal season",
  };
}
