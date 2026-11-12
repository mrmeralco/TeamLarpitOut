export interface ChargeLine {
  label: string;
  amount: number;
}

export interface BillInput {
  period: string;
  kwh: number;
  billingDays: number;
  chargeLines: ChargeLine[];
  dueDate?: string;
  previousReading?: number;
  presentReading?: number;
  estimated?: boolean;
  lifelineEligible?: boolean;
}

export interface Effect {
  key: "rate" | "billingDays" | "weather" | "habit";
  label: string;
  amount: number;
}

export interface BillSide {
  period: string;
  kwh: number;
  billingDays: number;
  rebuiltTotal: number;
  printedTotal: number | null;
  estimated: boolean;
  extras: { label: string; amount: number; kind: string; kindLabel: string }[];
  extrasTotal: number;
}

export interface ExtraLineItem {
  key: "lifeline" | "catchUp";
  label: string;
  amount: number;
  status?: "gained" | "lost" | "changed";
  kwh?: number;
}

/** All amounts are integer centavos. */
export interface BakitGanito {
  before: BillSide;
  now: BillSide;
  effects: Effect[];
  /** Lifeline / catch-up lines, only when they apply. */
  lines: ExtraLineItem[];
  habitMeasurable: boolean;
  total: number;
  printedChange: number | null;
  extrasChange: number;
  unexplained: number | null;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  periods: () => fetch("/api/rate-schedules").then((r) => json<{ periods: string[] }>(r)),
  bakitGanito: (before: BillInput, now: BillInput) =>
    fetch("/api/bakit-ganito", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ before, now }),
    }).then((r) => json<BakitGanito>(r)),
};

export interface DraftBill {
  period?: string;
  kwh?: number;
  billingDays?: number;
  dueDate?: string;
  previousReading?: number;
  presentReading?: number;
  chargeLines?: ChargeLine[];
  estimated?: boolean;
}

export type ScanOutcome =
  | {
      kind: "read";
      now: DraftBill;
      before: DraftBill | null;
      estimated: string[];
      missing: string[];
      serviceIdMasked: string | null;
    }
  | { kind: "unreadable"; problem: string }
  | { kind: "unavailable"; error: string };

/** Send a Bill photo to be read. The result is a draft the user must confirm. */
export async function scanBill(photo: File): Promise<ScanOutcome> {
  const form = new FormData();
  form.append("photo", photo);
  let res: Response;
  try {
    res = await fetch("/api/bills/scan", { method: "POST", body: form });
  } catch {
    return { kind: "unavailable", error: "Hindi maabot ang server. I-type na lang ang Bill." };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { kind: "read", ...body };
  if (res.status === 422 && body.status === "unreadable") return { kind: "unreadable", problem: body.problem };
  return { kind: "unavailable", error: body.error ?? `Hindi nabasa ang litrato (HTTP ${res.status}).` };
}

export interface LamanRow {
  label: string;
  amount: number;
  known: boolean;
  code: string | null;
  kind: "perKwh" | "fixed" | "tax" | null;
  payee: { type: "passThrough" | "meralco" | "government" | "subsidy"; name: string } | null;
  what: string;
  change: { status: "changed" | "new" | "noPrevious"; amount: number | null; previous: number | null };
}

/** All amounts are integer centavos. */
export interface Laman {
  groups: { key: string; title: string; total: number; rows: LamanRow[] }[];
  total: number;
  split: { passThrough: number; meralco: number };
}

export const lamanApi = (now: BillInput, before: BillInput) =>
  fetch("/api/bills/laman", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ now, before }),
  }).then((r) => json<Laman>(r));
