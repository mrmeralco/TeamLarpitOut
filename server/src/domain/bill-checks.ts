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

export interface BillChecksResult {
  overall: "green" | "red";
  checks: SingleCheckResult[];
  failedChecks: SingleCheckResult[];
  summary: string;
}

export interface BillCheckOptions {
  tolerancePesos?: number;
  householdSin?: string;
  payments?: PaymentRecord[];
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
  const title = "Kabuuan ng mga linya (Lines sum to total)";
  if (now.totalAmount === undefined) {
    return {
      key: "lineSum",
      title,
      status: "skipped",
      message: "Walang naka-print na total amount sa Bill upang ikumpara sa mga linya.",
    };
  }

  if (!now.chargeLines || now.chargeLines.length === 0) {
    return {
      key: "lineSum",
      title,
      status: "skipped",
      message: "Walang nakalistang charge lines sa Bill.",
    };
  }

  const linesSum = now.chargeLines.reduce((acc, line) => acc + line.amount, 0);
  const diff = Math.abs(linesSum - now.totalAmount);

  if (diff <= tolerancePesos) {
    return {
      key: "lineSum",
      title,
      status: "pass",
      message: `Tugma ang kabuuan ng mga linya sa total amount (diff: ₱${diff.toFixed(2)} <= ₱${tolerancePesos.toFixed(2)} tolerance).`,
    };
  }

  return {
    key: "lineSum",
    title,
    status: "fail",
    message: "Hindi nagtutugma ang kabuuan ng mga charge lines sa naka-print na Total Amount sa Bill.",
    discrepancy: {
      labelA: "Kabuuan ng Charge Lines sa Bill",
      valueA: `₱${linesSum.toFixed(2)}`,
      labelB: "Naka-print na Total Amount sa Bill",
      valueB: `₱${now.totalAmount.toFixed(2)}`,
    },
  };
}

/** Check 2: Previous reading = last Bill's present reading */
export function checkReadingContinuity(now: Bill, before?: Bill): SingleCheckResult {
  const title = "Continuity ng metro reading (Previous vs Present Reading)";

  if (!before) {
    return {
      key: "readingContinuity",
      title,
      status: "skipped",
      message: "Walang nakaraang Bill na mapagkukumparahan.",
    };
  }

  if (!areConsecutivePeriods(before.period, now.period)) {
    return {
      key: "readingContinuity",
      title,
      status: "skipped",
      message: `Hindi magkasunod ang billing periods (${before.period} at ${now.period}); may missing Bill sa pagitan.`,
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
      message: `Nagpalit ng metro (${before.meterSerialNumber} → ${now.meterSerialNumber}), kaya hindi inaasahang magtutugma ang reading.`,
    };
  }

  if (now.previousReading === undefined || before.presentReading === undefined) {
    return {
      key: "readingContinuity",
      title,
      status: "skipped",
      message: "Kulang ang datos ng meter readings (walang previous o present reading).",
    };
  }

  if (now.previousReading === before.presentReading) {
    return {
      key: "readingContinuity",
      title,
      status: "pass",
      message: `Tugma ang Previous reading (${now.previousReading}) sa Present reading ng nakaraang Bill (${before.presentReading}).`,
    };
  }

  return {
    key: "readingContinuity",
    title,
    status: "fail",
    message: "Hindi tugma ang Previous reading ng kasalukuyang Bill sa Present reading ng nakaraang Bill.",
    discrepancy: {
      labelA: "Previous reading sa kasalukuyang Bill",
      valueA: now.previousReading,
      labelB: "Present reading sa nakaraang Bill",
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
      message: `Walang published Rate Schedule para sa period na ${now.period}.`,
    };
  }

  if (!now.chargeLines || now.chargeLines.length === 0) {
    return {
      key: "rateSchedule",
      title,
      status: "skipped",
      message: "Walang charge lines sa Bill para ikumpara sa published Rate Schedule.",
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
            message: `Hindi tugma ang per-kWh rate ng ${line.label} sa published Rate Schedule ng Meralco.`,
            discrepancy: {
              labelA: `Rate sa Bill (${line.label})`,
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
            message: `Hindi tugma ang per-kWh rate ng ${line.label} sa published Rate Schedule ng Meralco.`,
            discrepancy: {
              labelA: `Epektibong Rate sa Bill (${line.label})`,
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
    message: `Lahat ng nasuring per-kWh rates ay tugma sa published Rate Schedule para sa ${now.period}.`,
  };
}

/** Check 4: Payments before the bill date reflected */
export function checkPaymentReflection(
  now: Bill,
  optionsPayments?: PaymentRecord[],
  tolerancePesos = 2.0,
): SingleCheckResult {
  const title = "Pag-reflect ng mga bayad bago ang Bill date";
  const payments = now.payments ?? optionsPayments;
  const billDate = now.billDate ?? now.dueDate;

  if (!payments || payments.length === 0) {
    return {
      key: "paymentReflection",
      title,
      status: "skipped",
      message: "Walang tala ng mga naunang bayad upang masuri kung nag-reflect sa Bill.",
    };
  }

  if (!billDate) {
    return {
      key: "paymentReflection",
      title,
      status: "skipped",
      message: "Walang petsa ng Bill (billDate o dueDate) para ikumpara sa petsa ng bayad.",
    };
  }

  const paymentsBefore = payments.filter((p) => p.date <= billDate);
  const paymentsAfter = payments.filter((p) => p.date > billDate);

  if (paymentsBefore.length === 0) {
    return {
      key: "paymentReflection",
      title,
      status: "pass",
      message: `Walang naitalang bayad bago o sa araw ng bill date (${billDate}). Ang ${paymentsAfter.length} bayad pagkatapos ng petsang ito ay tama lamang na hindi pa nag-reflect.`,
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
      message: `Naka-reflect sa Bill ang bayad na ginawa bago ang bill date (${billDate}): ₱${actualCredited.toFixed(2)}.`,
    };
  }

  return {
    key: "paymentReflection",
    title,
    status: "fail",
    message: `May bayad bago ang bill date (${billDate}) na hindi nag-reflect o hindi tugma sa ibinawas sa Bill.`,
    discrepancy: {
      labelA: `Naitalang bayad bago ang bill date (${billDate})`,
      valueA: `₱${expectedCredited.toFixed(2)}`,
      labelB: "Naka-reflect na bayad sa Bill",
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
    return "Lahat ng nasuring Meralco figures ay nagtutugma. Walang nakitang discrepancy.";
  }

  const lines: string[] = [
    "Magandang araw, Meralco Customer Care.",
    "",
    `Nais ko pong ipasuri ang aking Meralco Bill para sa period na ${now.period}${householdSin ? ` (SIN: ${householdSin})` : ""}.`,
    "Ayon sa pagsusuri ng mga opisyal na numero sa aking bill, may nakitang discrepancy:",
  ];

  for (let i = 0; i < failedChecks.length; i++) {
    const fc = failedChecks[i];
    lines.push("");
    lines.push(`${i + 1}. ${fc.title}:`);
    if (fc.discrepancy) {
      lines.push(`   • ${fc.discrepancy.labelA}: ${fc.discrepancy.valueA}`);
      lines.push(`   • ${fc.discrepancy.labelB}: ${fc.discrepancy.valueB}`);
    }
    lines.push(`   • Detalye: ${fc.message}`);
  }

  lines.push("");
  lines.push(
    "Maaari po bang paki-verify at ipaliwanag kung bakit magkaiba ang mga numerong ito sa aking bill? Salamat po.",
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
      message: "Walang RateScheduleTable na naibigay para sa pagsusuri.",
    });
  }

  // Check 4: Payment reflection
  checks.push(checkPaymentReflection(now, options.payments, tolerance));

  const failedChecks = checks.filter((c) => c.status === "fail");
  const overall = failedChecks.length > 0 ? "red" : "green";
  const summary = buildSummary(now, failedChecks, options.householdSin);

  return {
    overall,
    checks,
    failedChecks,
    summary,
  };
}
