export interface ChargeLine {
  label: string;
  amount: number;
}

export interface BillInput {
  period: string;
  kwh: number;
  billingDays: number;
  chargeLines: ChargeLine[];
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
