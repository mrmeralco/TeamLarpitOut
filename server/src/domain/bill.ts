/** One charge line as printed on the Bill, in pesos. */
export interface ChargeLine {
  label: string;
  amount: number;
  rate?: number;
}

/** One payment record with date and amount in pesos. */
export interface PaymentRecord {
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
}

/** One billing period's statement for one Household. */
export interface Bill {
  /** Billing month, "YYYY-MM"; picks the Rate Schedule. */
  period: string;
  kwh: number;
  billingDays: number;
  chargeLines?: ChargeLine[];
  /** Total current amount or amount due as printed, in pesos. */
  totalAmount?: number;
  /** "YYYY-MM-DD", statement or bill date as printed. */
  billDate?: string;
  /** "YYYY-MM-DD", as printed. */
  dueDate?: string;
  /** Meter serial number as printed on the Bill. */
  meterSerialNumber?: string;
  previousReading?: number;
  presentReading?: number;
  /** Payments received or recorded around this billing period. */
  payments?: PaymentRecord[];
  /** Total payments credited or deducted on this Bill, in pesos. */
  paymentsCredited?: number;
  /** Fixture provenance, never inferred from a photo. */
  provenance?: { kind: string; note: string };
  /** The Bill says its reading was estimated, not read from the meter. */
  estimated?: boolean;
  /** The household is registered for the lifeline discount. */
  lifelineEligible?: boolean;
}
