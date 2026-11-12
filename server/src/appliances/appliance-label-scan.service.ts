import { Inject, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { VISION_PROVIDER } from "../common/injection-tokens.js";
import { labelKwhPerHour, type EnergyLabelInput } from "../domain/appliance-usage.js";
import type { BillImage, VisionProvider } from "../vision/vision-provider.interface.js";

const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

/** Stateless: neither uploaded images nor drafts enter the appliance repository. */
@Injectable()
export class ApplianceLabelScanService {
  constructor(@Inject(VISION_PROVIDER) private readonly vision: VisionProvider) {}

  async scan(type: "aircon" | "refrigerator", image: BillImage) {
    const raw = await this.vision.readEnergyLabel(image);
    if (raw?.readable !== true || raw.type !== type) {
      throw new UnprocessableEntityException({
        status: "unreadable",
        error: "Hindi mabasa ang energy label o hindi tugma ang appliance. Kunan ulit o gamitin ang mga sagot mo.",
      });
    }

    const period = raw.period === "monthly" || raw.period === "daily" ? raw.period : null;
    const assumptions: { field: string; value: number; reason: string }[] = [];
    let referenceDays = period === "daily" ? 1 : positive(raw.referenceDays);
    let referenceHoursPerDay = type === "refrigerator" ? 24 : positive(raw.referenceHoursPerDay);
    if (period === "monthly" && raw.referenceDays == null) {
      referenceDays = 30;
      assumptions.push({ field: "referenceDays", value: 30, reason: "Hindi nakalimbag ang bilang ng araw; ipinagpalagay na 30 araw/buwan. Pakisuri." });
    }
    if (type === "aircon" && raw.referenceHoursPerDay == null) {
      referenceHoursPerDay = 9;
      assumptions.push({ field: "referenceHoursPerDay", value: 9, reason: "Hindi nakalimbag ang oras; paunang palagay na 9 oras/araw. Itama kung iba ang batayan ng label." });
    }
    if (referenceHoursPerDay !== null && referenceHoursPerDay > 24) referenceHoursPerDay = null;
    const label = { consumptionKwh: positive(raw.consumptionKwh), period, referenceDays, referenceHoursPerDay };
    const missing = Object.entries(label).filter(([, value]) => value === null).map(([field]) => field);
    let kwhPerHour: number | null = null;
    if (!missing.length) {
      const normalized = labelKwhPerHour(type, label as EnergyLabelInput);
      if (positive(normalized) !== null && Number.isFinite(normalized * 24 * 20)) kwhPerHour = normalized;
      else {
        label.consumptionKwh = null;
        missing.push("consumptionKwh");
      }
    }
    return { status: "read" as const, type, label, kwhPerHour, missing, assumptions, needsConfirmation: true as const };
  }
}
