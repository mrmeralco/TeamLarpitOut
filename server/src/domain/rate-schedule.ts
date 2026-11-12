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

/**
 * Lifeline discount for eligible (registered) households: the tier is picked
 * by total kWh, and its discount applies to the listed per-kWh charges.
 */
export interface LifelineRule {
  discountedCodes: string[];
  /** Ascending by upToKwh; above the last tier there is no discount. */
  tiers: { upToKwh: number; discount: number }[];
}

/** Meralco's published charges for one billing month ("YYYY-MM"). */
export interface RateSchedule {
  period: string;
  perKwh: PerKwhCharge[];
  fixed: FixedCharge[];
  lifeline?: LifelineRule;
}

export interface CostOptions {
  /** The household is registered for the lifeline discount. */
  lifelineEligible?: boolean;
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

/** The lifeline discount (centavos, ≥ 0) at this kWh, before eligibility is considered. */
export function lifelineDiscount(kwh: number, schedule: RateSchedule): Centavos {
  const rule = schedule.lifeline;
  const tier = rule?.tiers.find((t) => kwh <= t.upToKwh);
  if (!rule || !tier) return 0;
  const discounted = schedule.perKwh
    .filter((c) => rule.discountedCodes.includes(c.code))
    .reduce((sum, c) => sum + toCentavos(c.rate * kwh), 0);
  return Math.round(discounted * tier.discount);
}

/** cost() before any lifeline discount. */
export function baseCost(kwh: number, days: number, schedule: RateSchedule): Centavos {
  return costLines(kwh, days, schedule).reduce((sum, l) => sum + l.amount, 0);
}

/**
 * cost(kWh, days, schedule) in centavos, lifeline discount included for an
 * eligible household. `days` is in the signature for pro-rated charges.
 */
export function cost(kwh: number, days: number, schedule: RateSchedule, opts: CostOptions = {}): Centavos {
  return baseCost(kwh, days, schedule) - (opts.lifelineEligible ? lifelineDiscount(kwh, schedule) : 0);
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
