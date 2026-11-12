import { Inject, Injectable } from "@nestjs/common";
import type { Bill, ChargeLine } from "../domain/bill.js";
import { VISION_PROVIDER } from "../common/injection-tokens.js";
import type { BillImage, RawBillReading, VisionProvider } from "../vision/vision-provider.interface.js";

import { ScanContextStore, tenDigits } from "../vision/scan-context.store.js";
import { maskCan } from "../households/households.service.js";

export type DraftBill = Partial<Bill>;

/** A Bill as read from a photo. Not used anywhere until the user confirms it. */
export type ScanResult =
  | {
      status: "read";
      /** The scanned Bill, prefilled. */
      now: DraftBill;
      /**
       * The previous month from the Bill's printed history, when present.
       * Its billing days are not printed, so they are prefilled from this Bill
       * and flagged in `estimated`.
       */
      before: DraftBill | null;
      estimated: string[];
      /** Fields the user still has to fill before confirming. */
      missing: string[];
      /** Service ID Number, masked; the full number is never sent back. */
      serviceIdMasked: string | null;
      /** Customer Account Number, masked; null when the photo did not show a full CAN. */
      canMasked: string | null;
      needsConfirmation: true;
    }
  | { status: "unreadable"; problem: string };

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const num = (v: unknown, min = 0): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= min ? v : undefined;
const str = (v: unknown, re: RegExp): string | undefined => (typeof v === "string" && re.test(v) ? v : undefined);

export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function maskServiceId(sin: string | null | undefined): string | null {
  const digits = (sin ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return "•".repeat(Math.max(digits.length - 4, 4)) + digits.slice(-4);
}

function chargeLines(raw: RawBillReading["chargeLines"]): ChargeLine[] {
  return (raw ?? [])
    .filter((l) => typeof l?.label === "string" && l.label.trim() && Number.isFinite(l.amount))
    .map((l) => ({ label: l.label.trim(), amount: l.amount }));
}

/** Turns what the vision model claims to see into an editable draft. */
export function toScanResult(raw: RawBillReading): ScanResult {
  const unreadable = "We couldn't read the photo. Retake it clearly.";
  if (!raw?.readable) return { status: "unreadable", problem: raw?.problem || unreadable };

  const billingDays = num(raw.billingDays, 1);
  const now: DraftBill = {
    period: str(raw.period, PERIOD),
    kwh: num(raw.kwh),
    billingDays: billingDays !== undefined && Number.isInteger(billingDays) && billingDays <= 62 ? billingDays : undefined,
    dueDate: str(raw.dueDate, DATE),
    previousReading: num(raw.previousReading),
    presentReading: num(raw.presentReading),
    chargeLines: chargeLines(raw.chargeLines),
    ...(raw.estimated === true ? { estimated: true } : {}),
  };

  const keyFields = ["period", "kwh", "billingDays"] as const;
  const missing = keyFields.filter((f) => now[f] === undefined);
  if (missing.length === keyFields.length) return { status: "unreadable", problem: unreadable };

  let before: DraftBill | null = null;
  const estimated: string[] = [];
  if (now.period) {
    const prev = previousPeriod(now.period);
    const entry = (raw.history ?? []).find((h) => h?.period === prev && num(h.kwh) !== undefined);
    if (entry) {
      before = { period: prev, kwh: entry.kwh, billingDays: now.billingDays, chargeLines: [] };
      estimated.push("before.billingDays");
    }
  }

  return {
    status: "read",
    now,
    before,
    estimated,
    missing: [...missing],
    serviceIdMasked: maskServiceId(raw.serviceIdNumber),
    canMasked: (() => { const can = tenDigits(raw.customerAccountNumber); return can ? maskCan(can) : null; })(),
    needsConfirmation: true,
  };
}

export const DEFAULT_SIMULATED_BILL: RawBillReading = {
  readable: true,
  customerAccountNumber: "3901234482",
  serviceIdNumber: "1234567890",
  period: "2026-10",
  billingDays: 31,
  kwh: 240,
  dueDate: "2026-11-20",
  previousReading: 10450,
  presentReading: 10690,
  chargeLines: [
    { label: "Generation Charge", amount: 1618.32 },
    { label: "Transmission Charge", amount: 248.06 },
    { label: "System Loss Charge", amount: 148.9 },
    { label: "Distribution Charge", amount: 328.99 },
    { label: "Subsidies", amount: 0.38 },
    { label: "Government Taxes", amount: 236.85 },
    { label: "Universal Charges", amount: 54.34 },
    { label: "FIT-All (Renewable)", amount: 20.11 },
  ],
  history: [
    { period: "2026-08", kwh: 230 },
    { period: "2026-09", kwh: 220 },
  ],
};

@Injectable()
export class BillScanService {
  constructor(@Inject(VISION_PROVIDER) private readonly vision: VisionProvider, private readonly contexts: ScanContextStore) {}

  async scan(image: BillImage) {
    const raw = await this.vision.readBill(image);
    const result = toScanResult(raw);
    if (result.status !== "read") return { result, can: null, accountName: null };
    const accountName = typeof raw.accountName === "string" && raw.accountName.trim() ? raw.accountName.trim().slice(0, 120) : null;
    return {
      result: { ...result, scanToken: this.contexts.create(raw.customerAccountNumber, result.now, accountName) },
      can: tenDigits(raw.customerAccountNumber),
      accountName,
    };
  }

  async simulate(can?: string) {
    const targetCan = (can ? tenDigits(can) : null) ?? "3901234482";
    const targetSin = targetCan === "3901567213" ? "9876543210" : targetCan === "3901234482" ? "1234567890" : `8${targetCan.slice(1)}`;
    const raw: RawBillReading = {
      ...DEFAULT_SIMULATED_BILL,
      customerAccountNumber: targetCan,
      serviceIdNumber: targetSin,
    };
    const result = toScanResult(raw);
    if (result.status !== "read") return { result, can: null };
    return {
      result: { ...result, scanToken: this.contexts.create(raw.customerAccountNumber, result.now) },
      can: tenDigits(raw.customerAccountNumber),
    };
  }
}
