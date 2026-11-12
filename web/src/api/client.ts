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
export type ReadingInterval = "hour" | "day" | "week";
export interface ReadingRange { from: string; to: string }
export interface UsageReadings {
  sin: string;
  interval: ReadingInterval;
  timeZone: "Asia/Manila";
  range: ReadingRange | null;
  available: ReadingRange | null;
  provenance: { kind: "synthetic"; note: string };
  readings: (ReadingRange & { kwh: number; partial: boolean })[];
}
export interface HistoryBill extends BillInput { provenance?: { kind: string; note: string } }
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
  startSignIn: (email: string) => fetch("/api/auth/email/start", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
  }).then((r) => json<{ sent: true; expiresInSeconds: number }>(r)),
  verifySignIn: (email: string, code: string) => fetch("/api/auth/email/verify", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }),
  }).then((r) => json<{ token: string }>(r)),
  households: (token: string, signal?: AbortSignal) => fetch("/api/households", {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  }).then((r) => json<Household[]>(r)),
  logout: async (token: string) => {
    const res = await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await json(res);
  },
  history: (token: string, sin: string, signal?: AbortSignal) => fetch(`/api/households/${encodeURIComponent(sin)}/bills`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  }).then((r) => json<HistoryBill[]>(r)),
  /** Omit bounds so the server selects its latest available window for this interval. */
  readings: (token: string, sin: string, interval: ReadingInterval, signal?: AbortSignal) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/readings?${new URLSearchParams({ interval })}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
    }).then((r) => json<UsageReadings>(r)),
  householdExplanation: (token: string, sin: string, signal?: AbortSignal) => fetch(`/api/households/${encodeURIComponent(sin)}/bakit-ganito`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  }).then((r) => json<BakitGanito>(r)),
  periods: () => fetch("/api/rate-schedules").then((r) => json<{ periods: string[] }>(r)),
  bakitGanito: (token: string, before: BillInput, now: BillInput) =>
    fetch("/api/bakit-ganito", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ before, now }),
    }).then((r) => json<BakitGanito>(r)),
  billChecks: (
    token: string,
    now: BillInput,
    before?: BillInput,
    options?: { tolerancePesos?: number; payments?: PaymentRecord[] },
  ) =>
    fetch("/api/bills/check", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
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

/** What a scan did to the login's pending Account Linking. */
export type LinkActivation =
  | { status: "active"; householdSin: string; canMasked: string }
  | { status: "pending"; reason: "differentAccount" | "canUnread"; canMasked: string }
  | { status: "refused"; reason: "ownedByAnother"; message: string }
  | { status: "none" };

export interface LinkSummary {
  status: "pending" | "active";
  householdSin?: string;
  canMasked: string;
  area: string;
  meterType: "traditional" | "smart";
  billsOnRecord: number;
  firstPeriod: string | null;
  lastPeriod: string | null;
}

export const linkApi = {
  start: (token: string, can: string) => fetch("/api/households/link", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ can }),
  }).then((r) => json<LinkSummary>(r)),
  pending: (token: string, signal?: AbortSignal) => fetch("/api/households/link", authed(token, signal))
    .then((r) => json<{ pending: LinkSummary | null }>(r)),
  confirmTyped: (token: string, scanToken: string, can: string) => fetch("/api/households/link/confirm", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ scanToken, can }),
  }).then((r) => json<LinkActivation>(r)),
};

export type ScanOutcome =
  | {
      kind: "read";
      now: DraftBill;
      before: DraftBill | null;
      estimated: string[];
      missing: string[];
      serviceIdMasked: string | null;
      canMasked?: string | null;
      link?: LinkActivation;
      scanToken: string;
    }
  | { kind: "unreadable"; problem: string }
  | { kind: "unavailable"; error: string };

/** Send a Bill photo to be read. The result is a draft the user must confirm. */
export async function scanBill(photo: File, token: string): Promise<ScanOutcome> {
  const form = new FormData();
  form.append("photo", photo);
  let res: Response;
  try {
    res = await fetch("/api/bills/scan", { method: "POST", body: form, headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return { kind: "unavailable", error: "Hindi maabot ang server. I-type na lang ang Bill." };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { kind: "read", ...body };
  if (res.status === 401) return { kind: "unavailable", error: "HTTP 401: Mag-sign in muna." };
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

export const fetchBillBreakdown = (token: string, now: BillInput, before?: BillInput) =>
  fetch("/api/bills/laman", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
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
/** Confirmed label values for one aircon or refrigerator; normalized by the server. */
export interface EnergyLabelInput {
  consumptionKwh: number;
  period: "monthly" | "daily";
  referenceDays?: number;
  referenceHoursPerDay?: number;
  confirmed: true;
}
export interface EnergyLabelDraft {
  status: "read";
  type: "aircon" | "refrigerator";
  label: {
    consumptionKwh: number | null;
    period: "monthly" | "daily" | null;
    referenceDays: number | null;
    referenceHoursPerDay: number | null;
  };
  kwhPerHour: number | null;
  missing: string[];
  assumptions: { field: string; value: number; reason: string }[];
  needsConfirmation: true;
}
export interface ApplianceInput {
  type: string;
  quantity?: number;
  answers?: Record<string, string>;
  timeRanges?: TimeRange[];
  usesPerWeek?: number;
  energyLabel?: EnergyLabelInput;
}
export interface SavedAppliance extends ApplianceInput {
  energyLabel?: EnergyLabelInput & { kwhPerHour: number };
  label: string;
  routine: RoutineKind;
  source: "label" | "answers" | "default";
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

export interface AirconProposalOption {
  action: "confirm" | "longer" | "shorter";
  label: string;
  hours: number;
}

export interface AirconProposalResult {
  canPropose: boolean;
  hours: number | null;
  coolingKwhPerDay?: number;
  airconKw?: number;
  prompt?: string;
  options?: AirconProposalOption[];
  reason?: string;
  fallback?: "routine";
}

/** Create a standard daily time range yielding the given hours (starting at 22:00). */
export function rangeFromHours(hours: number): TimeRange {
  const clamped = Math.max(1, Math.min(23, Math.round(hours)));
  const startHour = 22;
  const endHour = (startHour + clamped) % 24;
  return {
    start: "22:00",
    end: `${String(endHour).padStart(2, "0")}:00`,
    days: "everyday",
  };
}

const authed = (token: string, signal?: AbortSignal): RequestInit => ({
  headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
});
const householdPath = (sin: string) => `/api/households/${encodeURIComponent(sin)}/appliances`;

export const appliancesApi = {
  scanLabel: (token: string, sin: string, type: "aircon" | "refrigerator", photo: File, signal?: AbortSignal) => {
    const body = new FormData();
    body.append("type", type);
    body.append("photo", photo);
    return fetch(`${householdPath(sin)}/scan-label`, { ...authed(token, signal), method: "POST", body })
      .then((r) => json<EnergyLabelDraft>(r));
  },
  catalog: (signal?: AbortSignal) =>
    fetch("/api/appliances/catalog", { signal }).then((r) => json<{ appliances: CatalogAppliance[] }>(r)),
  list: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(householdPath(sin), authed(token, signal)).then((r) => json<HouseholdAppliances>(r)),
  airconProposal: (token: string, sin: string, query?: Record<string, string>, signal?: AbortSignal) => {
    const cleanQuery = query
      ? Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ""))
      : undefined;
    const qs = cleanQuery && Object.keys(cleanQuery).length > 0 ? "?" + new URLSearchParams(cleanQuery).toString() : "";
    return fetch(`${householdPath(sin)}/aircon-proposal${qs}`, authed(token, signal)).then((r) => json<AirconProposalResult>(r));
  },
  save: (token: string, sin: string, appliances: ApplianceInput[]) =>
    fetch(householdPath(sin), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ appliances }),
    }).then((r) => json<HouseholdAppliances>(r)),
  breakdown: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`${householdPath(sin)}/breakdown`, authed(token, signal)).then((r) => json<ApplianceBreakdown>(r)),
};

/** Amounts in centavos. */
export interface TargetResult {
  period: string;
  billingDays: number;
  rateSchedulePeriod: string;
  baseline: {
    kwh: number;
    kwhPerDay: number;
    pesos: number;
    weatherAdjusted: boolean;
    weatherKwhPerDay: number;
    heatSensitivity: { value: number; source: string; label: string };
  };
  options: { cut: 5 | 10 | 15; kwh: number; pesos: number; savings: number }[];
}
export interface Mission {
  id: string;
  title: string;
  appliance: string;
  basis: "physics" | "assumption";
  assumptions: { key: string; label: string; value: number }[];
  kwhSaved: number;
  pesoValue: number;
  /** Worded by the Coach; numbers shown in the app come from kwhSaved and pesoValue. */
  message: string;
}
export interface UsagePlan {
  period: string;
  cut: 5 | 10 | 15;
  targetKwh: number;
  targetPesos: number;
  airconSetting: number | null;
  missions: { id: string; title: string; kwhSaved: number; pesoValue: number }[];
  createdAt: string;
}

export interface ForecastRange {
  minKwh: number;
  maxKwh: number;
  minPesos: number;
  maxPesos: number;
}

export interface ForecastProjected {
  kwh: number;
  pesos: number;
  kwhSoFar: number;
  elapsedDays: number;
  remainingDays: number;
  reading: number;
  readingDate: string | null;
}

export interface TargetComparison {
  targetKwh: number;
  targetPesos: number;
  diffPesos: number;
  diffKwh: number;
  status: "within_target" | "over_target";
  label: string;
}

export interface ForecastResult {
  currency: "PHP-centavos";
  period: string;
  billingDays: number;
  rateSchedulePeriod: string;
  hasReading: boolean;
  lastReading: number | null;
  range: ForecastRange | null;
  projected: ForecastProjected | null;
  targetComparison: TargetComparison | null;
  heatWave: {
    active: boolean;
    heatIndex: number | null;
    banner: string | null;
    kwhAdjustmentPerDay: number;
  };
  heatSensitivity: {
    value: number;
    source: string;
    label: string;
    sigma: number;
  };
}

export interface PointsHistoryEntry {
  id: string;
  sin?: string;
  period: string;
  points: number;
  savedPesos: number;
  savedKwh: number;
  baselineKwh: number;
  actualKwh: number;
  source: string;
  hasOutage: boolean;
  excludedReason?: string | null;
  description: string;
  createdAt: string;
  rewardId?: string;
  rewardName?: string;
}

export interface PointsResult {
  currency: string;
  balance: number;
  history: PointsHistoryEntry[];
}

export interface CatalogRewardItem {
  id: string;
  name: string;
  category: "load" | "e-wallet" | "voucher";
  partnerName: string;
  pointsCost: number;
  description: string;
  tag: string;
  isSampleReward: boolean;
  affordable: boolean;
  progressPercent: number;
  pointsNeeded: number;
}

export interface RewardsCatalogResult {
  sin: string;
  balance: number;
  tag: string;
  disclaimer: string;
  catalog: CatalogRewardItem[];
  redemptions: PointsHistoryEntry[];
}

export interface RedeemRewardResult {
  success: boolean;
  message: string;
  reward: {
    id: string;
    name: string;
    category: string;
    partnerName?: string;
    pointsCost: number;
    tag: string;
  };
  redeemedPoints: number;
  balance: number;
  disclaimer: string;
  redemption: PointsHistoryEntry;
}

const planPath = (sin: string) => `/api/households/${encodeURIComponent(sin)}`;

export const usagePlanApi = {
  target: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`${planPath(sin)}/target`, authed(token, signal)).then((r) => json<TargetResult>(r)),
  missions: (token: string, sin: string, airconSetting?: number, signal?: AbortSignal) =>
    fetch(`${planPath(sin)}/missions${airconSetting ? `?airconSetting=${airconSetting}` : ""}`, authed(token, signal)).then((r) =>
      json<{ period: string; perKwhRate: number; missions: Mission[] }>(r),
    ),
  plan: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`${planPath(sin)}/usage-plan`, authed(token, signal)).then((r) => json<{ active: boolean; plan: UsagePlan | null }>(r)),
  save: (token: string, sin: string, body: { cut: number; missionIds: string[]; airconSetting?: number }) =>
    fetch(`${planPath(sin)}/usage-plan`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<{ active: boolean; plan: UsagePlan }>(r)),
  forecast: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`${planPath(sin)}/forecast`, authed(token, signal)).then((r) => json<ForecastResult>(r)),
  saveReading: (token: string, sin: string, body: { reading: number; elapsedDays?: number; readingDate?: string }) =>
    fetch(`${planPath(sin)}/mid-month-reading`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<ForecastResult>(r)),
  deleteReading: (token: string, sin: string) =>
    fetch(`${planPath(sin)}/mid-month-reading`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => json<ForecastResult>(r)),
  points: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`${planPath(sin)}/points`, authed(token, signal)).then((r) => json<PointsResult>(r)),
  selfReport: (token: string, sin: string, body?: { missionId?: string; status?: string }) =>
    fetch(`${planPath(sin)}/usage-plan/self-report`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }).then((r) => json<{ awardedPoints: number; balance: number; message: string }>(r)),
};

export const rewardsApi = {
  catalog: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/rewards`, authed(token, signal)).then((r) =>
      json<RewardsCatalogResult>(r),
    ),
  redeem: (token: string, sin: string, rewardId: string) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/rewards/redeem`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ rewardId }),
    }).then((r) => json<RedeemRewardResult>(r)),
};

export type HomeBadge = "green" | "yellow" | "red";
/** Amounts in centavos. Each card names the section ("screen") it links to. */
export interface HomeChargeLine {
  id: string;
  label: string;
  amount: number;
  previous: number | null;
  change: number | null;
  kind: "perKwh" | "fixed" | "tax" | null;
  payee: { type: "passThrough" | "meralco" | "government" | "subsidy"; name: string } | null;
  goesTo: string | null;
  printed: string[];
}
export interface HomePart { key: string; label: string; amount: number }
export interface HomeSummary {
  meterType: "traditional" | "smart";
  canMasked: string | null;
  area: string;
  chargeLines: { featured: HomeChargeLine[]; all: HomeChargeLine[] };
  bill: { period: string; amountDue: number | null; dueDate: string | null; billDate: string | null };
  badge: { status: HomeBadge; label: string };
  bakitGanito: {
    sentence: string; total: number; screen: "bakit-ganito"; previousPeriod: string;
    effects: HomePart[]; lines: HomePart[]; addsUp: boolean; habit: number;
  } | null;
  bakitGanitoUnavailable: string | null;
  tamaBa: { status: HomeBadge; label: string; failedChecks: number; summary: string; screen: "tama-ba" };
  action:
    | { kind: "missions" | "householdChange"; label: string; screen: "missions" }
    | { kind: "askMeralco"; label: string; screen: "tama-ba"; summary: string };
  smartMeter: { monthToDateKwh: number | null } | null;
}

export const homeApi = {
  summary: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/home`, authed(token, signal)).then((r) => json<HomeSummary>(r)),
};
