import type { BillImage, RawAirconPhotoReading, RawBillReading, RawEnergyLabelReading, VisionProvider } from "./vision-provider.interface.js";
import { VisionUnavailableError } from "./vision-provider.interface.js";

/** Gemini usually answers in 2-4 s; past this the fallback reads the photo instead. */
const PRIMARY_TIMEOUT_MS = Number(process.env.VISION_PRIMARY_TIMEOUT_MS ?? 15_000);

class PrimaryTimeout extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PrimaryTimeout(`no answer within ${ms} ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const reason = (err: unknown) => {
  const status = (err as { status?: unknown })?.status;
  return `${typeof status === "number" ? `HTTP ${status}: ` : ""}${(err as Error)?.message ?? String(err)}`.slice(0, 200);
};

/**
 * Reads the Bill with `primary` (Gemini). When it fails (no key, quota used up, error or timeout),
 * reads the same photo with `fallback` (the ML service's local OCR). An unreadable answer from the
 * primary is final: the customer retakes the photo. Energy labels and aircon photos use the primary only.
 */
export class FallbackVisionProvider implements VisionProvider {
  constructor(
    private readonly primary: VisionProvider,
    private readonly fallback: VisionProvider,
    private readonly timeoutMs = PRIMARY_TIMEOUT_MS,
  ) {}

  async readBill(image: BillImage): Promise<RawBillReading> {
    let primaryError: unknown;
    try {
      return await withTimeout(this.primary.readBill(image), this.timeoutMs);
    } catch (err) {
      primaryError = err;
      console.warn(`Bill scan: Gemini could not read the photo (${reason(err)}); reading it with the ML service instead.`);
    }
    try {
      return await this.fallback.readBill(image);
    } catch (fallbackError) {
      console.warn(`Bill scan: the ML service could not read it either (${reason(fallbackError)}).`);
      // Neither is set up or reachable → 503 "not set up"; otherwise a real failure → 502.
      if (primaryError instanceof VisionUnavailableError && fallbackError instanceof VisionUnavailableError) throw fallbackError;
      throw primaryError instanceof VisionUnavailableError ? fallbackError : primaryError;
    }
  }

  readEnergyLabel(image: BillImage): Promise<RawEnergyLabelReading> {
    return this.primary.readEnergyLabel(image);
  }

  readAirconPhoto(image: BillImage): Promise<RawAirconPhotoReading> {
    if (!this.primary.readAirconPhoto) throw new VisionUnavailableError("Aircon photos are not supported");
    return this.primary.readAirconPhoto(image);
  }
}
