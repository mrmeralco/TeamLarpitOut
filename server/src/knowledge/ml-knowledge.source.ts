import type { KnowledgePassage, KnowledgeSource } from "./knowledge-source.interface.js";

const TIMEOUT_MS = 1500;

/**
 * Calls the ML service (ml-service/, FastAPI) at ML_SERVICE_URL for /rag/search.
 * If the service is down, slow or answers badly, the charge chat simply gets no passages
 * and keeps working from the line's facts and templates.
 */
export class MlKnowledgeSource implements KnowledgeSource {
  private warned = false;

  constructor(private readonly baseUrl = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000") {}

  async search({ lineLabel, question, k = 2 }: { lineLabel: string; question: string; k?: number }): Promise<KnowledgePassage[]> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/rag/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineLabel: lineLabel.slice(0, 120), question: question.slice(0, 300), k }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { passages?: { title?: unknown; text?: unknown; source?: unknown }[] };
      return (body.passages ?? [])
        .filter((p) => typeof p.title === "string" && typeof p.text === "string" && typeof p.source === "string")
        .filter((p) => /^https:\/\/(www\.)?meralco\.com\.ph\//.test(p.source as string))
        .map((p) => ({ title: p.title as string, text: p.text as string, url: p.source as string }));
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn(`ML service retrieval unavailable at ${this.baseUrl} (${(err as Error).message}); charge chat continues without passages.`);
      }
      return [];
    }
  }
}
