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
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const base = body.error ?? (Array.isArray(body.message) ? body.message.join(" ") : body.message) ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, Array.isArray(body.issues) && body.issues.length ? `${base} ${body.issues.join("; ")}` : base);
  }
  return body as T;
}

export interface CodeSent { channel: "sms" | "email"; sentTo: string; expiresInSeconds: number }
const post = <T>(path: string, body: unknown) => fetch(path, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then((r) => json<T>(r));

export const api = {
  /** Sign up 1/3: email + mobile number; a one-time code goes to the phone. */
  signUp: (email: string, phone: string) => post<CodeSent>("/api/auth/signup", { email, phone }),
  resendCode: (email: string, channel: "sms" | "email") => post<CodeSent>("/api/auth/signup/resend", { email, channel }),
  /** Sign up 2/3: the code; the email then gets a verification link. */
  verifyCode: (email: string, code: string) =>
    post<{ sentTo: string; expiresInHours: number; demoLink?: string }>("/api/auth/signup/verify", { email, code }),
  checkLink: (token: string) => post<{ email: string }>("/api/auth/signup/link", { token }),
  /** Sign up 3/3: create a password from the email link; signs the person in. */
  createPassword: (token: string, password: string) => post<{ token: string }>("/api/auth/signup/password", { token, password }),
  signIn: (email: string, password: string) => post<{ token: string }>("/api/auth/signin", { email, password }),
  households: (token: string, signal?: AbortSignal) => fetch("/api/households", {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  }).then((r) => json<Household[]>(r)),
  logout: async (token: string) => {
    const res = await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) await json(res);
  },
  /** Omit bounds so the server selects its latest available window for this interval. */
  readings: (token: string, sin: string, interval: ReadingInterval, signal?: AbortSignal) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/readings?${new URLSearchParams({ interval })}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
    }).then((r) => json<UsageReadings>(r)),
};

export interface DraftBill {
  period?: string;
  kwh?: number;
  billingDays?: number;
  dueDate?: string;
  previousReading?: number;
  presentReading?: number;
  chargeLines?: ChargeLine[];
  totalAmount?: number;
  estimated?: boolean;
}

interface AccountSummary {
  canMasked: string;
  area: string;
  meterType: "traditional" | "smart";
  billsOnRecord: number;
  firstPeriod: string | null;
  lastPeriod: string | null;
  /** Demo fallback: the CAN isn't in the mock data, so the sample Household opens instead. */
  demo?: true;
}
/** What the scanned Bill's CAN points to. Nothing is linked until "Yes, explain my bill". */
export type ScannedAccount =
  | ({ status: "found" } & AccountSummary)
  | ({ status: "alreadyLinked"; householdSin: string } & AccountSummary)
  | { status: "canUnread" }
  | { status: "unknownAccount"; canMasked: string };

export interface LinkCorrections { kwh?: number; billingDays?: number; totalAmount?: number }

export const linkApi = {
  /**
   * Links the CAN the scan read (or, when it couldn't, the CAN typed from the same Bill).
   * Corrections from "Does this look right?" go along; in demo mode the confirmed Bill
   * becomes the demo Household's latest Bill.
   */
  confirm: (token: string, scanToken: string, can?: string, corrections: LinkCorrections = {}) => fetch("/api/households/link/confirm", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ scanToken, ...(can ? { can } : {}), ...corrections }),
  }).then((r) => json<{ status: "active"; householdSin: string; canMasked: string; demo?: true }>(r)),
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
      account?: ScannedAccount;
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
    return { kind: "unavailable", error: "We couldn't reach the server. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { kind: "read", ...body };
  if (res.status === 401) return { kind: "unavailable", error: "HTTP 401: Please sign in first." };
  if (res.status === 422 && body.status === "unreadable") return { kind: "unreadable", problem: body.problem };
  return { kind: "unavailable", error: body.error ?? `We couldn't read the photo (HTTP ${res.status}).` };
}

/** Simulate reading a bill without uploading a photo or using vision AI quota. */
export async function simulateBill(
  token: string,
  options?: { can?: string; meterType?: "traditional" | "smart" },
): Promise<ScanOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/bills/simulate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options ?? {}),
    });
  } catch {
    return { kind: "unavailable", error: "We couldn't reach the server. Please try again." };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { kind: "read", ...body };
  if (res.status === 401) return { kind: "unavailable", error: "HTTP 401: Please sign in first." };
  if (res.status === 422 && body.status === "unreadable") return { kind: "unreadable", problem: body.problem };
  return { kind: "unavailable", error: body.error ?? `We couldn't simulate the bill (HTTP ${res.status}).` };
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

export type AirconPatternInput = Pick<ApplianceInput, "quantity" | "answers" | "energyLabel">;
interface AirconPatternEvidence {
  timeZone: "Asia/Manila";
  range: ReadingRange | null;
  expectedKw: number;
  ratingSource: "label" | "answers" | "default";
  coverage: { completeNights: number; matchingNights: number; heatMatchedNights: number };
  provenance: {
    readings: { kind: "synthetic"; note: string };
    weather: { kind: "synthetic" | "observed"; note: string } | null;
  };
}
export type AirconPatternResult = AirconPatternEvidence & ({
  status: "proposal"; canPropose: true; routine: TimeRange; hours: number; stepKw: number; prompt: string;
  heat: { temperatureSpanC: number; kwPerDegreeC: number; correlation: number };
} | { status: "fallback"; canPropose: false; fallback: "routine"; reason: string });

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
  airconPattern: (token: string, sin: string, input: AirconPatternInput, signal?: AbortSignal) =>
    fetch(`${householdPath(sin)}/aircon-pattern-proposal`, {
      ...authed(token, signal), method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<AirconPatternResult>(r)),
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


export interface PointsHistoryEntry {
  id: string;
  sin?: string;
  period: string;
  /** Smart meter daily entries only: the day the savings were measured (YYYY-MM-DD). */
  day?: string;
  points: number;
  savedPesos: number;
  savedKwh: number;
  baselineKwh: number;
  actualKwh: number;
  /** "bill_verified" (traditional, per Bill), "meter_verified" (smart meter, per day), "welcome", "redemption". */
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
  lockedPoints?: number;
  spendable?: number;
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
  /** Welcome Points that unlock at the first Verified Savings. */
  lockedPoints?: number;
  spendable?: number;
  tag: string;
  disclaimer: string;
  catalog: CatalogRewardItem[];
  /** Latest Points earned, newest first. */
  earned?: PointsHistoryEntry[];
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

/** One month of the Bill History, as the usage chart on Home needs it. */
export interface UsageMonth { period: string; kwh: number; billingDays: number; provenance?: { kind: string; note: string } }

export const homeApi = {
  summary: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/home`, authed(token, signal)).then((r) => json<HomeSummary>(r)),
  /** Bill History, oldest first; Home charts its kWh. */
  usage: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/bills`, authed(token, signal)).then((r) => json<UsageMonth[]>(r)),
};

export interface ChargeAnswer {
  lineId: string;
  kind: "answer" | "askMeralco" | "redirect";
  source: "ai" | "template";
  answer: string;
  summary?: string | null;
  /** Official explanation from Meralco's public bill guide, retrieved for this charge (empty if unavailable). */
  sources?: { title: string; text: string; url: string }[];
}

export const chargeApi = {
  ask: (token: string, sin: string, lineId: string, question: string) =>
    fetch(`/api/households/${encodeURIComponent(sin)}/charges/${encodeURIComponent(lineId)}/ask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ question }),
    }).then((r) => json<ChargeAnswer>(r)),
};

export type HomePattern = "allDay" | "eveningsWeekends" | "daytime";
export type AirconPattern = "sleeping" | "afternoonNight" | "mostOfDay";
export interface SetupStatus {
  steps: { key: "household" | "appliances" | "routine"; label: string; done: boolean }[];
  doneCount: number;
  total: number;
  complete: boolean;
  household: { size: number } | null;
  routine: { home: HomePattern; aircon: AirconPattern | null } | null;
  hasAircon: boolean;
  grid?: Record<string, number> | null;
  gridCatalog?: GridTile[];
  welcomePoints: { points: number; granted: boolean; locked: boolean };
}
export interface GridTile { type: string; label: string; kwh: number; unit: string; tag: "Typical value" | "Estimated from photo" }
export interface AirconCheck {
  source: "bills" | "smartMeter"; available: boolean; chosenHours: number;
  estimatedHours?: number; agrees?: boolean; message?: string; reason?: string;
}

const setupPath = (sin: string) => `/api/households/${encodeURIComponent(sin)}/setup`;
export const setupApi = {
  status: (token: string, sin: string, signal?: AbortSignal) =>
    fetch(setupPath(sin), authed(token, signal)).then((r) => json<SetupStatus>(r)),
  household: (token: string, sin: string, size: number) =>
    fetch(`${setupPath(sin)}/household`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ size }),
    }).then((r) => json<SetupStatus>(r)),
  grid: (token: string, sin: string, counts: Record<string, number>) =>
    fetch(`${setupPath(sin)}/appliances`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ counts }),
    }).then((r) => json<SetupStatus>(r)),
  airconPhoto: (token: string, sin: string, photo: File) => {
    const form = new FormData();
    form.append("photo", photo);
    return fetch(`${setupPath(sin)}/aircon-photo`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form })
      .then((r) => json<{ answers: Record<string, string>; kwhPerHour: number; tag: "Estimated from photo" }>(r));
  },
  airconCheck: (token: string, sin: string, aircon: AirconPattern, signal?: AbortSignal) =>
    fetch(`${setupPath(sin)}/aircon-check?aircon=${aircon}`, authed(token, signal)).then((r) => json<AirconCheck>(r)),
  routine: (token: string, sin: string, home: HomePattern, aircon: AirconPattern | null) =>
    fetch(`${setupPath(sin)}/routine`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ home, aircon }),
    }).then((r) => json<SetupStatus>(r)),
};

export interface PlanMission {
  id: string;
  title: string;
  why: string;
  how: string[];
  appliance: string;
  kwhSaved: number;
  /** Centavos. */
  pesoValue: number;
  /** Percent of the Baseline (the goal is 5). */
  percent: number;
  /** Share of the 5% goal. */
  share: number;
  effort: "Easy" | "Medium";
  basis: "physics" | "assumption";
  assumptions: { key: string; label: string; value: number }[];
}
export interface MissionPlan {
  period: string;
  goal: { cut: number; kwh: number; pesos: number; baselineKwh: number; targetKwh: number; targetPesos: number };
  covered: number;
  coveredPercent: number;
  source: "ai" | "fallback";
  missions: PlanMission[];
  points: string;
  changed?: boolean;
  swapped?: { out: string; in: string };
}

const missionPath = (sin: string) => `/api/households/${encodeURIComponent(sin)}/missions`;
export const missionPlanApi = {
  get: (token: string, sin: string, signal?: AbortSignal) => fetch(`${missionPath(sin)}/plan`, authed(token, signal)).then((r) => json<MissionPlan>(r)),
  shuffle: (token: string, sin: string) =>
    fetch(`${missionPath(sin)}/plan/shuffle`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).then((r) => json<MissionPlan>(r)),
  swap: (token: string, sin: string, id: string) =>
    fetch(`${missionPath(sin)}/${encodeURIComponent(id)}/swap`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).then((r) => json<MissionPlan>(r)),
};
