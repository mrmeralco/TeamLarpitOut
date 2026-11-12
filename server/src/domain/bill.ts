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
}
