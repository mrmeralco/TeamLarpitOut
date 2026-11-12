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
}
