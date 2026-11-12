/** One passage of Meralco's public "Understand Your Bill" text, with its official page. */
export interface KnowledgePassage {
  title: string;
  text: string;
  url: string;
}

/**
 * Retrieval (RAG) over Meralco's public bill guide. Returns public text only, so the passages
 * may be given to the AI as context. Never throws: no passages when retrieval is unavailable.
 */
export interface KnowledgeSource {
  search(input: { lineLabel: string; question: string; k?: number }): Promise<KnowledgePassage[]>;
}

export const noKnowledge: KnowledgeSource = { search: async () => [] };
