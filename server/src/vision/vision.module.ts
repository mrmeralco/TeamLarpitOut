import { Module } from "@nestjs/common";
import { VISION_PROVIDER } from "../common/injection-tokens.js";
import { GeminiVisionProvider } from "./gemini-vision.provider.js";

/** The hosted vision model, shared by bill scan and (later) energy label scan. */
@Module({
  providers: [{ provide: VISION_PROVIDER, useFactory: () => new GeminiVisionProvider() }],
  exports: [VISION_PROVIDER],
})
export class VisionModule {}
