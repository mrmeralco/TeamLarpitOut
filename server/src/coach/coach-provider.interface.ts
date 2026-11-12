import type { ChargeFacts } from "../domain/charge-chat.js";
import type { PlannedMission } from "../domain/mission-plan.js";

/** One computed candidate, as the AI sees it: no personal data, only this Mission's figures. */
export interface CandidateFacts {
  id: string;
  title: string;
  appliance: string;
  kwhSaved: number;
  pesos: number;
  percent: number;
  effort: string;
  group: string;
  why: string;
}

/** The figures a Mission message may mention. All computed by code. */
export interface MissionFacts {
  id: string;
  title: string;
  kwhSaved: number;
  /** Centavos. */
  pesoValue: number;
}

/**
 * The AI Coach: turns computed Mission facts into one short, friendly line.
 * It only phrases; every kWh and peso shown in the app comes from code.
 */
export interface CoachProvider {
  phraseMission(facts: MissionFacts): Promise<string>;
  /**
   * Answers one question about one charge line from that line's computed facts only.
   * Returns null when it has no answer (no AI configured, error, timeout); the server then uses the template.
   */
  answerCharge?(input: { facts: ChargeFacts; question: string }): Promise<string | null>;
  /**
   * Picks up to five candidate ids that together reach about 5% and words each for this home.
   * `avoid` lists sets already shown (for shuffle). Null when it has no answer; the server then picks.
   */
  pickMissionPlan?(input: { goalPercent: number; candidates: CandidateFacts[]; avoid: string[][] }): Promise<PlannedMission[] | null>;
}
