import { Module } from "@nestjs/common";
import { COACH_PROVIDER } from "../common/injection-tokens.js";
import { GeminiCoachProvider } from "./gemini-coach.provider.js";

@Module({
  providers: [{ provide: COACH_PROVIDER, useFactory: () => new GeminiCoachProvider() }],
  exports: [COACH_PROVIDER],
})
export class CoachModule {}
