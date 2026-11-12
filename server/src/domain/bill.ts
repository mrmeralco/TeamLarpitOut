/** One charge line as printed on the Bill, in pesos. */
export interface ChargeLine {
  label: string;
  amount: number;
}

/** One billing period's statement for one Household. */
export interface Bill {
  /** Billing month, "YYYY-MM"; picks the Rate Schedule. */
  period: string;
  kwh: number;
  billingDays: number;
  chargeLines?: ChargeLine[];
  /** "YYYY-MM-DD", as printed. */
  dueDate?: string;
  previousReading?: number;
  presentReading?: number;
  /** The Bill says its reading was estimated, not read from the meter. */
  estimated?: boolean;
  /** The household is registered for the lifeline discount. */
  lifelineEligible?: boolean;
}
