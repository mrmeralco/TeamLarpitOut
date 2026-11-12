/**
 * The vision seam: a hosted model reads Bill or energy-label photos into raw fields.
 * Only this box touches images; every peso afterwards comes from code.
 */

export interface BillImage {
  mimeType: string;
  data: Buffer;
}

/** What the model claims to see. Every field may be missing or wrong; the user confirms. */
export interface RawBillReading {
  readable: boolean;
  /** Why it could not be read (blurry, not a Meralco bill, cut off...). */
  problem?: string;
  serviceIdNumber?: string | null;
  /** Customer Account Number (CAN) as printed. */
  customerAccountNumber?: string | null;
  period?: string | null;
  billingDays?: number | null;
  kwh?: number | null;
  dueDate?: string | null;
  previousReading?: number | null;
  presentReading?: number | null;
  /** The Bill marks this reading as estimated. */
  estimated?: boolean | null;
  chargeLines?: { label: string; amount: number }[] | null;
  /** The bill's printed consumption history, if any. */
  history?: { period: string; kwh: number }[] | null;
}

/** Printed values only. Missing/ambiguous fields stay null; code handles normalization. */
export interface RawEnergyLabelReading {
  readable: boolean;
  type?: "aircon" | "refrigerator" | null;
  consumptionKwh?: number | null;
  period?: "monthly" | "daily" | null;
  referenceDays?: number | null;
  referenceHoursPerDay?: number | null;
}

export interface VisionProvider {
  readBill(image: BillImage): Promise<RawBillReading>;
  readEnergyLabel(image: BillImage): Promise<RawEnergyLabelReading>;
}

/** Thrown when no vision model is configured (e.g. no API key). */
export class VisionUnavailableError extends Error {}
