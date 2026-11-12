import { GoogleGenAI } from "@google/genai";
import { chargePrompt, type ChargeFacts, type ChargeReference } from "../domain/charge-chat.js";
import type { CandidateFacts, CoachProvider, MissionFacts } from "./coach-provider.interface.js";
import type { PlannedMission } from "../domain/mission-plan.js";
import { TemplateCoachProvider } from "./template-coach.provider.js";

const TIMEOUT_MS = 4000;
/** After a quota or rate-limit error (429), skip Gemini this long and use the fallbacks at once. */
const QUOTA_PAUSE_MS = 10 * 60_000;

const isQuotaError = (err: unknown) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(String((err as Error)?.message ?? err));

const prompt = (f: MissionFacts) => `You are Eelio, the friendly electric eel energy coach. Write ONE short sentence in English
encouraging a Filipino family to do this Mission: "${f.title}".
Do not include any number, price or percentage; the app shows those.
Do not promise exact savings. One sentence only, no emoji.`;

/**
 * Gemini words the Mission; any reply with a digit is discarded so a number can
 * never come from the AI. Falls back to the template on no key, error or timeout.
 */
export class GeminiCoachProvider implements CoachProvider {
  /** Gemini is skipped until this time after a quota error, so no request waits on a call that will fail. */
  private pausedUntil = 0;

  private available(): boolean {
    return Boolean(this.client) && Date.now() >= this.pausedUntil;
  }

  private noteFailure(err: unknown) {
    if (isQuotaError(err)) this.pausedUntil = Date.now() + QUOTA_PAUSE_MS;
  }

  private readonly client: GoogleGenAI | null;
  private readonly fallback = new TemplateCoachProvider();

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    private readonly model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  ) {
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async phraseMission(f: MissionFacts): Promise<string> {
    if (!this.available()) return this.fallback.phraseMission(f);
    try {
      const reply = await Promise.race([
        this.client!.models.generateContent({ model: this.model, contents: prompt(f) }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("coach timeout")), TIMEOUT_MS)),
      ]);
      const text = (reply.text ?? "").trim().replace(/\s+/g, " ");
      if (!text || /\d/.test(text) || text.length > 200) return this.fallback.phraseMission(f);
      return text;
    } catch (err) {
      this.noteFailure(err);
      return this.fallback.phraseMission(f);
    }
  }

  /** The prompt holds only this line's facts, public Meralco reference text and the question. Null on no key, error or timeout. */
  async answerCharge({ facts, question, references }: { facts: ChargeFacts; question: string; references?: ChargeReference[] }): Promise<string | null> {
    if (!this.available()) return null;
    try {
      const reply = await Promise.race([
        this.client!.models.generateContent({ model: this.model, contents: chargePrompt(facts, question, references) }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("coach timeout")), TIMEOUT_MS)),
      ]);
      const text = (reply.text ?? "").trim().replace(/\s+/g, " ");
      return text && text.length <= 700 ? text : null;
    } catch (err) {
      this.noteFailure(err);
      return null;
    }
  }

  /** Gets only the computed candidates; the server validates ids and figures and falls back to its own pick. */
  async pickMissionPlan({ goalPercent, candidates, avoid }: { goalPercent: number; candidates: CandidateFacts[]; avoid: string[][] }): Promise<PlannedMission[] | null> {
    if (!this.available()) return null;
    const prompt = `You are Eelio's coach for a Filipino household. Pick 3 to 5 Missions from the candidates whose "percent" values add up to at least ${goalPercent}, mixing appliances, at most one per "group" (pick fewer than 3 only if fewer candidates fit those rules). Prefer a mix of easy wins and bigger savings that suit this home.
Do not pick exactly any of these sets: ${JSON.stringify(avoid)}.
For each pick write a short friendly "title" (max 8 words) and a one-sentence "why" for this home, in English.
Use ONLY numbers that appear in that candidate's own fields; never invent or compute a number.
Candidates (JSON): ${JSON.stringify(candidates)}`;
    try {
      const reply = await Promise.race([
        this.client!.models.generateContent({
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
    } catch (err) {
      this.noteFailure(err);
      return null;
    }
  }
}
