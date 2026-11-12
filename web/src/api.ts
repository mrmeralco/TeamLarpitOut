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
}

export interface Household {
  sin: string;
  masked_address: string;
  meter_type: "traditional" | "smart";
}
export interface LoginResult { token: string; households: Household[] }
export interface HistoryBill extends BillInput { provenance?: { kind: string; note: string } }
export type ScanLinkage = { status: "linked"; householdSin: string } | { status: "unlinked" | "unknown" };
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
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
}

/** All amounts are integer centavos. */
export interface BakitGanito {
  before: BillSide;
  now: BillSide;
  effects: Effect[];
  total: number;
  printedChange: number | null;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? (Array.isArray(body.message) ? body.message.join(" ") : body.message) ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  login: (email: string, password: string) => fetch("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  }).then((r) => json<LoginResult>(r)),
  logout: async (token: string) => {
    const res = await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await json(res);
  },
  history: (token: string, sin: string, signal?: AbortSignal) => fetch(`/api/households/${encodeURIComponent(sin)}/bills`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  }).then((r) => json<HistoryBill[]>(r)),
  householdExplanation: (token: string, sin: string, signal?: AbortSignal) => fetch(`/api/households/${encodeURIComponent(sin)}/bakit-ganito`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  }).then((r) => json<BakitGanito>(r)),
  scanLinkage: (token: string, scanToken: string, signal?: AbortSignal) => fetch("/api/bills/scan-linkage", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ scanToken }), signal,
  }).then((r) => json<ScanLinkage>(r)),
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
}

export type ScanOutcome =
  | {
      kind: "read";
      now: DraftBill;
      before: DraftBill | null;
      estimated: string[];
      missing: string[];
      serviceIdMasked: string | null;
      scanToken: string;
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
