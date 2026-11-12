import { Module } from "@nestjs/common";
import { KNOWLEDGE_SOURCE } from "../common/injection-tokens.js";
import { MlKnowledgeSource } from "./ml-knowledge.source.js";

/** Retrieval over Meralco's public bill guide, served by the ML service. */
@Module({
  providers: [{ provide: KNOWLEDGE_SOURCE, useFactory: () => new MlKnowledgeSource() }],
  exports: [KNOWLEDGE_SOURCE],
})
export class KnowledgeModule {}
