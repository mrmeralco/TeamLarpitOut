import type { CoachProvider, MissionFacts } from "./coach-provider.interface.js";

const peso = (centavos: number) =>
  `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Deterministic wording, used when no AI is configured or the AI fails. */
export class TemplateCoachProvider implements CoachProvider {
  async phraseMission(f: MissionFacts): Promise<string> {
    return `${f.title}: you could save about ${f.kwhSaved} kWh, about ${peso(f.pesoValue)} on your next Bill.`;
  }
}
