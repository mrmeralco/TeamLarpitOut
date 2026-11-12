import { Module } from "@nestjs/common";
import { CHAT_COACH_PROVIDER, COACH_PROVIDER } from "../common/injection-tokens.js";
import type { CoachProvider } from "./coach-provider.interface.js";
import { GeminiCoachProvider } from "./gemini-coach.provider.js";

/**
 * The charge chat's AI. With GEMINI_CHAT_API_KEY set it gets its own Gemini client (and
 * GEMINI_CHAT_MODEL, else GEMINI_MODEL), so its quota is separate from bill scans and Missions.
 * Gemini counts free-tier quota per Google Cloud project, so that key must come from another project.
 * Without it, the chat shares the Missions coach.
 */
export function chatCoachProvider(shared: CoachProvider, env: NodeJS.ProcessEnv = process.env): CoachProvider {
  const apiKey = env.GEMINI_CHAT_API_KEY?.trim();
  if (!apiKey) return shared;
  const model = env.GEMINI_CHAT_MODEL?.trim() || env.GEMINI_MODEL?.trim();
  return model ? new GeminiCoachProvider(apiKey, model) : new GeminiCoachProvider(apiKey);
}

@Module({
  providers: [
    { provide: COACH_PROVIDER, useFactory: () => new GeminiCoachProvider() },
    { provide: CHAT_COACH_PROVIDER, inject: [COACH_PROVIDER], useFactory: (shared: CoachProvider) => chatCoachProvider(shared) },
  ],
  exports: [COACH_PROVIDER, CHAT_COACH_PROVIDER],
})
export class CoachModule {}
