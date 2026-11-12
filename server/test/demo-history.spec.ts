import { describe, expect, it } from "vitest";
import { demoHistory, shiftPeriod } from "../src/domain/demo-history.js";
import type { Bill } from "../src/domain/bill.js";

const sample: Bill[] = Array.from({ length: 12 }, (_, i) => ({
  period: shiftPeriod("2025-12", i), kwh: 200 + i, billingDays: 30,
  billDate: `${shiftPeriod("2025-12", i)}-31`.replace(/-(02|04|06|09|11)-31$/, "-$1-30"),
  dueDate: `${shiftPeriod("2025-12", i)}-15`,
  provenance: { kind: "generated", note: "sample" },
}));

describe("demoHistory", () => {
  it("shiftPeriod crosses years both ways", () => {
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2025-12", 1)).toBe("2026-01");
    expect(shiftPeriod("2026-06", -11)).toBe("2025-07");
  });

  it("the scanned Bill is the latest; the 11 sample Bills before the sample's latest move to the months before it", () => {
    const out = demoHistory(sample, { period: "2026-06", kwh: 412, billingDays: 31, dueDate: "2026-06-20" });
    expect(out).toHaveLength(12);
    expect(out.map((b) => b.period)).toEqual(Array.from({ length: 12 }, (_, i) => shiftPeriod("2025-07", i)));
    expect(out.at(-1)).toMatchObject({ period: "2026-06", kwh: 412, billingDays: 31, dueDate: "2026-06-20", provenance: { kind: "scanned" } });
    // Earlier months keep the sample's usage and provenance, with dates moved along (day clamped).
    expect(out[0]).toMatchObject({ kwh: 200, provenance: { kind: "generated" }, dueDate: "2025-07-15", billDate: "2025-07-31" });
    expect(out[1]!.billDate).toBe("2025-08-31");
    expect(out.find((b) => b.period === "2026-02")!.billDate).toBe("2026-02-28");
  });

  it("sample meter readings are rewritten to lead into the scanned Bill's previous reading", () => {
    const withReadings = sample.map((b) => ({ ...b, previousReading: 100, presentReading: 100 + b.kwh }));
    const out = demoHistory(withReadings, { period: "2026-06", kwh: 400, billingDays: 31, previousReading: 47643, presentReading: 48043 });
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i]!.presentReading).toBe(out[i + 1]!.previousReading);
      expect(out[i]!.presentReading! - out[i]!.previousReading!).toBe(out[i]!.kwh);
    }
    // Without a scanned reading the sample readings are dropped rather than left to contradict it.
    expect(demoHistory(withReadings, { period: "2026-06", kwh: 400, billingDays: 31 })[0]!.presentReading).toBeUndefined();
  });

  it("does not change the sample", () => {
    const before = structuredClone(sample);
    demoHistory(sample, { period: "2026-06", kwh: 1, billingDays: 30 });
    expect(sample).toEqual(before);
  });

  it("without period, kWh or billing days the sample History is used as is", () => {
    expect(demoHistory(sample, { period: "2026-06", kwh: 400 })).toEqual(sample);
  });
});
