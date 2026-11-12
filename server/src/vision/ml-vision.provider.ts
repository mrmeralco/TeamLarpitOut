import type { BillImage, RawAirconPhotoReading, RawBillReading, RawEnergyLabelReading, VisionProvider } from "./vision-provider.interface.js";
import { VisionUnavailableError } from "./vision-provider.interface.js";

/** Local OCR takes about 8-10 s on a laptop CPU; allow for a slow first request. */
const TIMEOUT_MS = 60_000;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

/**
 * Reads Bill photos with the ML service (ml-service/, FastAPI): RapidOCR on our own machine plus a
 * deterministic parser. The photo goes only to ML_SERVICE_URL, never to an outside AI.
 * Energy label and aircon photos are not handled by the ML service and go to `photos` (Gemini).
 */
export class MlVisionProvider implements VisionProvider {
  constructor(
    private readonly photos: VisionProvider,
    private readonly baseUrl = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000",
  ) {}

  async readBill(image: BillImage): Promise<RawBillReading> {
    const form = new FormData();
    form.append("photo", new Blob([new Uint8Array(image.data)], { type: image.mimeType }), `bill.${EXT[image.mimeType] ?? "jpg"}`);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/ocr/bill`, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      // Not running (connection refused) or not reachable: same answer as an unconfigured scan.
      throw new VisionUnavailableError(`ML service not reachable at ${this.baseUrl}: ${(err as Error).message}`);
    }
    if (res.status === 400 || res.status === 413) {
      const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
      return { readable: false, problem: typeof body.detail === "string" ? body.detail : "We couldn't read the photo. Retake it clearly." };
    }
    if (!res.ok) throw new Error(`ML service /ocr/bill answered HTTP ${res.status}`);
    const r = (await res.json()) as RawBillReading;
    // Only the fields the app uses; extras (timings, debug text) stay out.
    return {
      readable: r.readable === true,
      problem: r.problem ?? undefined,
      serviceIdNumber: r.serviceIdNumber ?? null,
      customerAccountNumber: r.customerAccountNumber ?? null,
      period: r.period ?? null,
      billingDays: r.billingDays ?? null,
      kwh: r.kwh ?? null,
      dueDate: r.dueDate ?? null,
      previousReading: r.previousReading ?? null,
      presentReading: r.presentReading ?? null,
      estimated: r.estimated ?? null,
      chargeLines: r.chargeLines ?? null,
      history: r.history ?? null,
    };
  }

  readEnergyLabel(image: BillImage): Promise<RawEnergyLabelReading> {
    return this.photos.readEnergyLabel(image);
  }

  readAirconPhoto(image: BillImage): Promise<RawAirconPhotoReading> {
    if (!this.photos.readAirconPhoto) throw new VisionUnavailableError("Aircon photos are not supported");
    return this.photos.readAirconPhoto(image);
  }
}
