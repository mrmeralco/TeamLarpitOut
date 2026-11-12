import type { TargetCut } from "../domain/baseline.js";

/** The Target and Missions a Household chose for one billing period. */
export interface UsagePlan {
  /** The billing month the plan is for ("YYYY-MM"); Missions last this one period. */
  period: string;
  cut: TargetCut;
  targetKwh: number;
  /** Centavos. */
  targetPesos: number;
  airconSetting: number | null;
  missions: { id: string; title: string; kwhSaved: number; pesoValue: number }[];
  createdAt: string;
  /**
   * When the Household first started Missions; kept across shuffles, swaps and new periods.
   * Smart meter daily Points count from the next day, against the days before it (ADR-0008).
   */
  startedAt?: string;
  /** Mission Plan (ADR-0007): who picked it, the AI's wording, and every set shown so far (for shuffle). */
  source?: "ai" | "fallback" | "manual";
  wording?: Record<string, { title: string; why: string }>;
  shown?: string[][];
}

export interface UsagePlanRepository {
  find(sin: string): Promise<UsagePlan | null>;
  save(sin: string, plan: UsagePlan): Promise<UsagePlan>;
}
