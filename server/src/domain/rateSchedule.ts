/**
 * Rate Schedule and cost() (ADR-0001).
 *
 * Every peso the decoder reports comes from rebuilding a Bill with cost().
 * Amounts are integer centavos so the effects telescope to the real change exactly.
 */

export type Centavos = number;

/** A Bill line priced per kWh used. Using less lowers it. */
export interface PerKwhCharge {
  code: string;
  label: string;
  /** Pesos per kWh. */
  rate: number;
  /** Collected for someone else (generation, transmission, ...). */
  passThrough: boolean;
}

/** A Bill line charged per customer per month regardless of kWh. */
export interface FixedCharge {
  code: string;
  label: string;
  /** Pesos per customer per month. */
  amount: number;
}

/** Meralco's published charges for one billing month ("YYYY-MM"). */
export interface RateSchedule {
  period: string;
  perKwh: PerKwhCharge[];
  fixed: FixedCharge[];
}

export interface CostLine {
  code: string;
  label: string;
  kind: "perKwh" | "fixed";
  amount: Centavos;
}

const toCentavos = (pesos: number): Centavos => Math.round(pesos * 100);

/** Rebuild a Bill line by line from a Rate Schedule. */
export function costLines(kwh: number, _days: number, schedule: RateSchedule): CostLine[] {
  return [
    ...schedule.perKwh.map((c) => ({
      code: c.code,
      label: c.label,
      kind: "perKwh" as const,
      amount: toCentavos(c.rate * kwh),
    })),
    ...schedule.fixed.map((c) => ({
      code: c.code,
      label: c.label,
      kind: "fixed" as const,
      amount: toCentavos(c.amount),
    })),
  ];
}

/**
 * cost(kWh, days, schedule) in centavos. `days` is part of the signature so
 * lifeline, tiers and pro-rated charges (later tickets) can use it.
 */
export function cost(kwh: number, days: number, schedule: RateSchedule): Centavos {
  return costLines(kwh, days, schedule).reduce((sum, l) => sum + l.amount, 0);
}

/** Lookup into the one Rate Schedule table. */
export interface RateScheduleTable {
  get(period: string): RateSchedule | undefined;
  periods(): string[];
}

export function rateScheduleTable(schedules: RateSchedule[]): RateScheduleTable {
  const byPeriod = new Map(schedules.map((s) => [s.period, s]));
  return {
    get: (period) => byPeriod.get(period),
    periods: () => [...byPeriod.keys()].sort(),
  };
}
