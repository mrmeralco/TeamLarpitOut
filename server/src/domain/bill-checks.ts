import type { Bill, PaymentRecord } from "./bill.js";
import type { RateScheduleTable } from "./rate-schedule.js";
import { CHARGE_CATALOG } from "./charge-catalog.js";

export type CheckStatus = "pass" | "fail" | "skipped";

export interface DisagreeingFigures {
  labelA: string;
  valueA: string | number;
  labelB: string;
  valueB: string | number;
}

export interface SingleCheckResult {
  key: "lineSum" | "readingContinuity" | "rateSchedule" | "paymentReflection";
  title: string;
  status: CheckStatus;
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

export interface BillCheckOptions {
  tolerancePesos?: number;
  householdSin?: string;
  payments?: PaymentRecord[];
  predictedDailyKwh?: number;
  hasHouseholdChange?: boolean;
}

export function areConsecutivePeriods(beforePeriod: string, nowPeriod: string): boolean {
  const [y1, m1] = beforePeriod.split("-").map(Number);
  const [y2, m2] = nowPeriod.split("-").map(Number);
  if (!y1 || !m1 || !y2 || !m2) return false;
  const monthDiff = (y2 - y1) * 12 + (m2 - m1);
  return monthDiff === 1;
}

/** Check 1: Lines sum to the total */
export function checkLineSum(now: Bill, tolerancePesos = 2.0): SingleCheckResult {
  const title = "Lines sum to the total";
  if (now.totalAmount === undefined) {
    return {
      key: "lineSum",
      title,
      status: "skipped",
      message: "The Bill has no printed total amount to compare the lines with.",
    };
  }

  if (!now.chargeLines || now.chargeLines.length === 0) {
    return {
      key: "lineSum",
      title,
      status: "skipped",
      message: "The Bill lists no charge lines.",
    };
  }

  const linesSum = now.chargeLines.reduce((acc, line) => acc + line.amount, 0);
  const diff = Math.abs(linesSum - now.totalAmount);

  if (diff <= tolerancePesos) {
    return {
      key: "lineSum",
      title,
      status: "pass",
      message: `The lines add up to the total amount (difference ₱${diff.toFixed(2)}, within the ₱${tolerancePesos.toFixed(2)} tolerance).`,
    };
  }

  return {
    key: "lineSum",
    title,
    status: "fail",
    message: "The charge lines do not add up to the Total Amount printed on the Bill.",
    discrepancy: {
      labelA: "Sum of the charge lines on the Bill",
      valueA: `₱${linesSum.toFixed(2)}`,
      labelB: "Total Amount printed on the Bill",
      valueB: `₱${now.totalAmount.toFixed(2)}`,
    },
  };
}

/** Check 2: Previous reading = last Bill's present reading */
export function checkReadingContinuity(now: Bill, before?: Bill): SingleCheckResult {
  const title = "Meter reading continuity (previous vs. present reading)";

  if (!before) {
    return {
      key: "readingContinuity",
      title,
      status: "skipped",
      message: "There is no previous Bill to compare with.",
    };
  }

  if (!areConsecutivePeriods(before.period, now.period)) {
    return {
      key: "readingContinuity",
      title,
      status: "skipped",
      message: `The billing periods are not consecutive (${before.period} and ${now.period}); a Bill in between is missing.`,
    };
  }

  if (
    now.meterSerialNumber &&
    before.meterSerialNumber &&
    now.meterSerialNumber !== before.meterSerialNumber
  ) {
    return {
      key: "readingContinuity",
      title,
      status: "skipped",
      message: `The meter was replaced (${before.meterSerialNumber} → ${now.meterSerialNumber}), so the readings are not expected to continue.`,
    };
  }

  if (now.previousReading === undefined || before.presentReading === undefined) {
    return {
      key: "readingContinuity",
      title,
      status: "skipped",
      message: "Meter readings are incomplete (no previous or present reading).",
    };
  }

  if (now.previousReading === before.presentReading) {
    return {
      key: "readingContinuity",
      title,
      status: "pass",
      message: `The previous reading (${now.previousReading}) matches the last Bill's present reading (${before.presentReading}).`,
    };
  }

  return {
    key: "readingContinuity",
    title,
    status: "fail",
    message: "This Bill's previous reading does not match the last Bill's present reading.",
    discrepancy: {
      labelA: "Previous reading on this Bill",
      valueA: now.previousReading,
      labelB: "Present reading on the last Bill",
      valueB: before.presentReading,
    },
  };
}

/** Check 3: Per-kWh rates = published Rate Schedule */
export function checkRateSchedule(
  now: Bill,
  scheduleTable: RateScheduleTable,
  tolerancePesos = 2.0,
): SingleCheckResult {
  const title = "Rate Schedule fidelity (per-kWh rates vs published table)";

  const schedule = scheduleTable.get(now.period);
  if (!schedule) {
    return {
      key: "rateSchedule",
      title,
      status: "skipped",
      message: `There is no published Rate Schedule for ${now.period}.`,
    };
  }

  if (!now.chargeLines || now.chargeLines.length === 0) {
    return {
      key: "rateSchedule",
      title,
      status: "skipped",
      message: "The Bill has no charge lines to compare with the published Rate Schedule.",
    };
  }

  for (const line of now.chargeLines) {
    const lineLabel = line.label.toLowerCase();
    const catalogMatch = CHARGE_CATALOG.find((entry) => entry.match.test(lineLabel));
    const matchedSched = schedule.perKwh.find((pk) => {
      const pkLabel = pk.label.toLowerCase();
      if (lineLabel.includes(pkLabel) || pkLabel.includes(lineLabel)) return true;
      if (catalogMatch && pk.code.toLowerCase() === catalogMatch.code.toLowerCase()) return true;
      return false;
    });

    if (matchedSched) {
      if (line.rate !== undefined) {
        const rateDiff = Math.abs(line.rate - matchedSched.rate);
        if (rateDiff > 0.005) {
          return {
            key: "rateSchedule",
            title,
            status: "fail",
            message: `The per-kWh rate of ${line.label} does not match Meralco's published Rate Schedule.`,
            discrepancy: {
              labelA: `Rate on the Bill (${line.label})`,
              valueA: `₱${line.rate.toFixed(4)}/kWh`,
              labelB: `Published Rate Schedule (${matchedSched.label})`,
              valueB: `₱${matchedSched.rate.toFixed(4)}/kWh`,
            },
          };
        }
      } else if (now.kwh > 0) {
        const effectiveRate = line.amount / now.kwh;
        const expectedAmount = matchedSched.rate * now.kwh;
        const amountDiff = Math.abs(line.amount - expectedAmount);
        if (amountDiff > tolerancePesos && Math.abs(effectiveRate - matchedSched.rate) > 0.01) {
          return {
            key: "rateSchedule",
            title,
            status: "fail",
            message: `The per-kWh rate of ${line.label} does not match Meralco's published Rate Schedule.`,
            discrepancy: {
              labelA: `Effective rate on the Bill (${line.label})`,
              valueA: `₱${effectiveRate.toFixed(4)}/kWh (Halaga: ₱${line.amount.toFixed(2)})`,
              labelB: `Published Rate Schedule (${matchedSched.label})`,
              valueB: `₱${matchedSched.rate.toFixed(4)}/kWh (Inaasahang halaga: ₱${expectedAmount.toFixed(2)})`,
            },
          };
        }
      }
    }
  }

  return {
    key: "rateSchedule",
    title,
    status: "pass",
    message: `Every per-kWh rate checked matches the published Rate Schedule for ${now.period}.`,
  };
}

/** Check 4: Payments before the bill date reflected */
export function checkPaymentReflection(
  now: Bill,
  optionsPayments?: PaymentRecord[],
  tolerancePesos = 2.0,
): SingleCheckResult {
  const title = "Payments made before the Bill date";
  const payments = now.payments ?? optionsPayments;
  const billDate = now.billDate ?? now.dueDate;

  if (!payments || payments.length === 0) {
    return {
      key: "paymentReflection",
      title,
      status: "skipped",
      message: "There is no record of earlier payments to check against the Bill.",
    };
  }

  if (!billDate) {
    return {
      key: "paymentReflection",
      title,
      status: "skipped",
      message: "The Bill has no date (bill date or due date) to compare with the payment dates.",
    };
  }

  const paymentsBefore = payments.filter((p) => p.date <= billDate);
  const paymentsAfter = payments.filter((p) => p.date > billDate);

  if (paymentsBefore.length === 0) {
    return {
      key: "paymentReflection",
      title,
      status: "pass",
      message: `No payment was recorded on or before the bill date (${billDate}). The ${paymentsAfter.length} payment(s) after that date are correctly not reflected yet.`,
    };
  }

  const expectedCredited = paymentsBefore.reduce((acc, p) => acc + p.amount, 0);

  let actualCredited = now.paymentsCredited;
  if (actualCredited === undefined) {
    const paymentLines = (now.chargeLines ?? []).filter((l) =>
      /payment|bayad|credit/i.test(l.label),
    );
    if (paymentLines.length > 0) {
      actualCredited = paymentLines.reduce((acc, l) => acc + Math.abs(l.amount), 0);
    } else {
      actualCredited = 0;
    }
  }

  const diff = Math.abs(expectedCredited - actualCredited);
  if (diff <= tolerancePesos) {
    return {
      key: "paymentReflection",
      title,
      status: "pass",
      message: `Payments made before the bill date (${billDate}) are reflected on the Bill: ₱${actualCredited.toFixed(2)}.`,
    };
  }

  return {
    key: "paymentReflection",
    title,
    status: "fail",
    message: `A payment made before the bill date (${billDate}) is not reflected, or does not match what the Bill credited.`,
    discrepancy: {
      labelA: `Payments recorded before the bill date (${billDate})`,
      valueA: `₱${expectedCredited.toFixed(2)}`,
      labelB: "Payments credited on the Bill",
      valueB: `₱${actualCredited.toFixed(2)}`,
    },
  };
}

function buildSummary(
  now: Bill,
  failedChecks: SingleCheckResult[],
  householdSin?: string,
): string {
  if (failedChecks.length === 0) {
    return "All of Meralco's figures checked match. No discrepancy found.";
  }

  const lines: string[] = [
    "Good day, Meralco Customer Care.",
    "",
    `I would like to have my Meralco Bill for ${now.period}${householdSin ? ` (SIN: ${householdSin})` : ""} checked.`,
    "Comparing the official figures on my bill, these do not match:",
  ];

  for (let i = 0; i < failedChecks.length; i++) {
    const fc = failedChecks[i];
    lines.push("");
    lines.push(`${i + 1}. ${fc.title}:`);
    if (fc.discrepancy) {
      lines.push(`   • ${fc.discrepancy.labelA}: ${fc.discrepancy.valueA}`);
      lines.push(`   • ${fc.discrepancy.labelB}: ${fc.discrepancy.valueB}`);
    }
    lines.push(`   • Details: ${fc.message}`);
  }

  lines.push("");
  lines.push(
    "Could you please verify and explain why these figures on my bill differ? Thank you.",
  );

  return lines.join("\n");
}

/**
 * Run the four Bill Checks (ADR-0002).
 */
export function runBillChecks(
  now: Bill,
  before?: Bill,
  scheduleTable?: RateScheduleTable,
  options: BillCheckOptions = {},
): BillChecksResult {
  const tolerance = options.tolerancePesos ?? 2.0;
  const checks: SingleCheckResult[] = [];

  // Check 1: Lines sum to total
  checks.push(checkLineSum(now, tolerance));

  // Check 2: Reading continuity
  checks.push(checkReadingContinuity(now, before));

  // Check 3: Rate Schedule
  if (scheduleTable) {
    checks.push(checkRateSchedule(now, scheduleTable, tolerance));
  } else {
    checks.push({
      key: "rateSchedule",
      title: "Rate Schedule fidelity (per-kWh rates vs published table)",
      status: "skipped",
      message: "No Rate Schedule table was provided for the check.",
    });
  }

  // Check 4: Payment reflection
  checks.push(checkPaymentReflection(now, options.payments, tolerance));

  const failedChecks = checks.filter((c) => c.status === "fail");

  // Outlier evaluation: kwh_now / days_now > predicted_kwh_per_day * 1.30 and no household change
  let outlier: OutlierEvaluation | undefined;
  let isOutlier = false;
  if (options.predictedDailyKwh !== undefined && options.predictedDailyKwh > 0 && now.billingDays > 0) {
    const dailyKwh = now.kwh / now.billingDays;
    const thresholdDailyKwh = options.predictedDailyKwh * 1.30;
    const hasHouseholdChange = Boolean(options.hasHouseholdChange);
    isOutlier = dailyKwh > thresholdDailyKwh && !hasHouseholdChange;
    outlier = {
      isOutlier,
      dailyKwh: Math.round(dailyKwh * 100) / 100,
      predictedDailyKwh: Math.round(options.predictedDailyKwh * 100) / 100,
      thresholdDailyKwh: Math.round(thresholdDailyKwh * 100) / 100,
      ratio: Math.round((dailyKwh / options.predictedDailyKwh) * 100) / 100,
      hasHouseholdChange,
    };
  }

  // Precedence: Red wins over Yellow, Yellow wins over Green
  // Yellow only when Bill Checks pass (failedChecks.length === 0) and usage exceeds the threshold
  let overall: "green" | "yellow" | "red";
  if (failedChecks.length > 0) {
    overall = "red";
  } else if (isOutlier) {
    overall = "yellow";
  } else {
    overall = "green";
  }

  // Summary: only build Meralco inquiry for red. Yellow and green never point to Meralco.
  const summary =
    overall === "red"
      ? buildSummary(now, failedChecks, options.householdSin)
      : overall === "yellow"
      ? "Higher than usual for this weather, but all of Meralco's official figures match."
      : "All of Meralco's figures checked match. No discrepancy found.";

  return {
    overall,
    checks,
    failedChecks,
    summary,
    outlier,
  };
}
