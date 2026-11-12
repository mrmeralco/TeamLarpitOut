import { GoogleGenAI } from "@google/genai";
import { chargePrompt, type ChargeFacts } from "../domain/charge-chat.js";
import type { CandidateFacts, CoachProvider, MissionFacts } from "./coach-provider.interface.js";
import type { PlannedMission } from "../domain/mission-plan.js";
import { TemplateCoachProvider } from "./template-coach.provider.js";

const TIMEOUT_MS = 4000;

const prompt = (f: MissionFacts) => `Ikaw si Eelio, ang friendly electric eel energy coach. Sumulat ng ISANG maikling pangungusap sa Taglish na
naghihikayat sa isang pamilyang Pilipino na gawin ang Mission na ito: "${f.title}".
Huwag maglagay ng kahit anong numero, presyo o porsyento; ipapakita ng app ang mga iyon.
Huwag mangako ng tiyak na tipid. Isang pangungusap lang, walang emoji.`;

/**
 * Gemini words the Mission; any reply with a digit is discarded so a number can
 * never come from the AI. Falls back to the template on no key, error or timeout.
 */
export class GeminiCoachProvider implements CoachProvider {
  private readonly client: GoogleGenAI | null;
  private readonly fallback = new TemplateCoachProvider();

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    private readonly model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  ) {
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async phraseMission(f: MissionFacts): Promise<string> {
    if (!this.client) return this.fallback.phraseMission(f);
    try {
      const reply = await Promise.race([
        this.client.models.generateContent({ model: this.model, contents: prompt(f) }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("coach timeout")), TIMEOUT_MS)),
      ]);
      const text = (reply.text ?? "").trim().replace(/\s+/g, " ");
      if (!text || /\d/.test(text) || text.length > 200) return this.fallback.phraseMission(f);
      return text;
    } catch {
      return this.fallback.phraseMission(f);
    }
  }

  /** The prompt holds only this line's facts and the question. Null on no key, error or timeout. */
  async answerCharge({ facts, question }: { facts: ChargeFacts; question: string }): Promise<string | null> {
    if (!this.client) return null;
    try {
      const reply = await Promise.race([
        this.client.models.generateContent({ model: this.model, contents: chargePrompt(facts, question) }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("coach timeout")), TIMEOUT_MS)),
      ]);
      const text = (reply.text ?? "").trim().replace(/\s+/g, " ");
      return text && text.length <= 700 ? text : null;
    } catch {
      return null;
    }
  }

  /** Gets only the computed candidates; the server validates ids and figures and falls back to its own pick. */
  async pickMissionPlan({ goalPercent, candidates, avoid }: { goalPercent: number; candidates: CandidateFacts[]; avoid: string[][] }): Promise<PlannedMission[] | null> {
    if (!this.client) return null;
    const prompt = `You are KuryenteKo's coach for a Filipino household. Pick 1 to 5 Missions from the candidates whose "percent" values add up to at least ${goalPercent} (use fewer if possible), mixing appliances, at most one per "group".
Do not pick exactly any of these sets: ${JSON.stringify(avoid)}.
For each pick write a short friendly "title" (max 8 words) and a one-sentence "why" for this home, in English.
Use ONLY numbers that appear in that candidate's own fields; never invent or compute a number.
Candidates (JSON): ${JSON.stringify(candidates)}`;
    try {
      const reply = await Promise.race([
        this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: {
              type: "object",
              properties: { missions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, why: { type: "string" } }, required: ["id", "title", "why"] } } },
              required: ["missions"],
            },
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("coach timeout")), TIMEOUT_MS * 2)),
      ]);
      const parsed = JSON.parse(reply.text ?? "") as { missions?: PlannedMission[] };
      return Array.isArray(parsed.missions) ? parsed.missions : null;
    } catch {
      return null;
    }
  }
}
