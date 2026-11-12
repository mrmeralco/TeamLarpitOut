import { GoogleGenAI } from "@google/genai";
import type { CoachProvider, MissionFacts } from "./coach-provider.interface.js";
import { TemplateCoachProvider } from "./template-coach.provider.js";

const TIMEOUT_MS = 4000;

const prompt = (f: MissionFacts) => `Ikaw ang KuryenteKo Coach. Sumulat ng ISANG maikling pangungusap sa Taglish na
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
}
