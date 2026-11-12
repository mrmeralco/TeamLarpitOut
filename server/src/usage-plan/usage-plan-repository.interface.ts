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
}

export interface UsagePlanRepository {
  find(sin: string): Promise<UsagePlan | null>;
  save(sin: string, plan: UsagePlan): Promise<UsagePlan>;
}
