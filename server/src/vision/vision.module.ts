import { Module } from "@nestjs/common";
import { VISION_PROVIDER } from "../common/injection-tokens.js";
import { FallbackVisionProvider } from "./fallback-vision.provider.js";
import { GeminiVisionProvider } from "./gemini-vision.provider.js";
import { MlVisionProvider } from "./ml-vision.provider.js";
import type { VisionProvider } from "./vision-provider.interface.js";

/**
 * Who reads Bill photos, from VISION_PROVIDER:
 *   gemini-ml (default): Gemini reads it; if Gemini fails (no key, quota, error, timeout),
 *                        the ML service (local OCR at ML_SERVICE_URL) reads the same photo.
 *   gemini:              Gemini only.
 *   ml:                  the ML service only (the photo never leaves this machine).
 * Energy label and aircon photos always use Gemini.
 */
export function visionProvider(choice = process.env.VISION_PROVIDER): VisionProvider {
  const gemini = new GeminiVisionProvider();
  if (choice === "gemini") return gemini;
  const ml = new MlVisionProvider(gemini);
  if (choice === "ml") return ml;
  return new FallbackVisionProvider(gemini, ml);
}

@Module({
  providers: [{ provide: VISION_PROVIDER, useFactory: () => visionProvider() }],
  exports: [VISION_PROVIDER],
})
export class VisionModule {}
