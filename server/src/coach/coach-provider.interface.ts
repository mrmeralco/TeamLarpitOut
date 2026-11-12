import type { ChargeFacts } from "../domain/charge-chat.js";

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
}
