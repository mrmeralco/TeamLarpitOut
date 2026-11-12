export interface ChargeLine {
  label: string;
  amount: number;
  rate?: number;
}

export interface PaymentRecord {
  date: string;
  amount: number;
}

export interface BillInput {
  period: string;
  kwh: number;
  billingDays: number;
  chargeLines: ChargeLine[];
  totalAmount?: number;
  billDate?: string;
  dueDate?: string;
  meterSerialNumber?: string;
  previousReading?: number;
  presentReading?: number;
  payments?: PaymentRecord[];
  paymentsCredited?: number;
  estimated?: boolean;
  lifelineEligible?: boolean;
}

export interface DisagreeingFigures {
  labelA: string;
  valueA: string | number;
  labelB: string;
  valueB: string | number;
}

export interface SingleCheckResult {
  key: "lineSum" | "readingContinuity" | "rateSchedule" | "paymentReflection";
  title: string;
  status: "pass" | "fail" | "skipped";
  message: string;
  discrepancy?: DisagreeingFigures;
}

export interface OutlierEvaluation {
  isOutlier: boolean;
  dailyKwh: number;
  predictedDailyKwh: number;
  thresholdDailyKwh: number;
  ratio: number;
  hasHouseholdChange: boolean;
}

export interface BillChecksResult {
  overall: "green" | "yellow" | "red";
  checks: SingleCheckResult[];
  failedChecks: SingleCheckResult[];
  summary: string;
  outlier?: OutlierEvaluation;
}

export interface HouseholdChange {
  reason: string;
  period?: string;
  recordedAt?: string;
}

export interface Household {
  sin: string;
  masked_address: string;
  meter_type: "traditional" | "smart";
  changes?: HouseholdChange[];
}
export interface LoginResult { token: string; households: Household[] }
export interface HistoryBill extends BillInput { provenance?: { kind: string; note: string } }
export type ScanLinkage = { status: "linked"; householdSin: string } | { status: "unlinked" | "unknown" };
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface WeatherDetail {
  heatSensitivity: number;
  source: "history" | "cooling_appliance_estimate";
  label: string;
  hotDayKwh: number;
  cddPerDayBefore?: number;
  cddPerDayNow?: number;
}

export interface Effect {
  key: "rate" | "billingDays" | "weather" | "habit";
  label: string;
  amount: number;
  estimate?: boolean;
  sensitivity?: number;
  sensitivitySource?: "history" | "cooling_appliance_estimate";
  sensitivityLabel?: string;
  hotDayKwh?: number;
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
  weatherDetail?: WeatherDetail;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const base = body.error ?? (Array.isArray(body.message) ? body.message.join(" ") : body.message) ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, Array.isArray(body.issues) && body.issues.length ? `${base} ${body.issues.join("; ")}` : base);
  }
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
  billChecks: (
    now: BillInput,
    before?: BillInput,
    options?: { tolerancePesos?: number; payments?: PaymentRecord[] },
  ) =>
    fetch("/api/bills/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ now, before, ...options }),
    }).then((r) => json<BillChecksResult>(r)),
  householdBillChecks: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/check`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    }).then((r) => json<BillChecksResult>(r)),
  recordHouseholdChange: (token: string, sin: string, reason: string, period?: string) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/changes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ reason, period }),
    }).then((r) => json<{ ok: boolean; change: HouseholdChange }>(r)),
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

export interface BillBreakdownRow {
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
export interface BillBreakdown {
  groups: { key: string; title: string; total: number; rows: BillBreakdownRow[] }[];
  total: number;
  split: { passThrough: number; meralco: number };
}

export const fetchBillBreakdown = (now: BillInput, before: BillInput) =>
  fetch("/api/bills/laman", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ now, before }),
  }).then((r) => json<BillBreakdown>(r));

export type RoutineKind = "alwaysOn" | "timeRanges" | "usesPerWeek";
export interface TimeRange { start: string; end: string; days: "everyday" | "weekdays" | "weekends" }
export interface CatalogAppliance {
  type: string;
  label: string;
  routine: RoutineKind;
  questions: { key: string; label: string; options: { value: string; label: string }[] }[];
}
export interface ApplianceInput {
  type: string;
  quantity?: number;
  answers?: Record<string, string>;
  timeRanges?: TimeRange[];
  usesPerWeek?: number;
}
export interface SavedAppliance extends ApplianceInput {
  label: string;
  routine: RoutineKind;
  source: "answers" | "default";
  sourceLabel: string;
  hoursPerDay: number | null;
  estimatedKwhPerDay: number;
}
export interface HouseholdAppliances { saved: boolean; updatedAt: string | null; appliances: SavedAppliance[] }
/** Amounts in centavos; row kWh add up exactly to the Bill's kWh. */
export interface ApplianceBreakdown {
  bill: { period: string; kwh: number; billingDays: number };
  rows: { index: number; type: string; label: string; quantity: number; source: string; sourceLabel: string; kwh: number; pesos: number; share: number }[];
  totals: { kwh: number; perKwhCharges: number; fixedCharges: number };
}

const authed = (token: string, signal?: AbortSignal): RequestInit => ({
  headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
});
const householdPath = (sin: string) => `/api/households/${encodeURIComponent(sin)}/appliances`;

export const appliancesApi = {
  catalog: (signal?: AbortSignal) =>
    fetch("/api/appliances/catalog", { signal }).then((r) => json<{ appliances: CatalogAppliance[] }>(r)),
  list: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(householdPath(sin), authed(token, signal)).then((r) => json<HouseholdAppliances>(r)),
  save: (token: string, sin: string, appliances: ApplianceInput[]) =>
    fetch(householdPath(sin), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ appliances }),
    }).then((r) => json<HouseholdAppliances>(r)),
  breakdown: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`${householdPath(sin)}/breakdown`, authed(token, signal)).then((r) => json<ApplianceBreakdown>(r)),
};
