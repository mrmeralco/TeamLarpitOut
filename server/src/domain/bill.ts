import { z } from "zod";

/** One charge line as printed on the Bill, in pesos. */
export const ChargeLineSchema = z.object({
  label: z.string().min(1),
  amount: z.number(),
});

/** One billing period's statement for one Household. */
export const BillSchema = z.object({
  /** Billing month, "YYYY-MM"; picks the Rate Schedule. */
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM"),
  kwh: z.number().nonnegative(),
  billingDays: z.number().int().positive(),
  chargeLines: z.array(ChargeLineSchema).default([]),
});

export type ChargeLine = z.infer<typeof ChargeLineSchema>;
export type Bill = z.infer<typeof BillSchema>;
