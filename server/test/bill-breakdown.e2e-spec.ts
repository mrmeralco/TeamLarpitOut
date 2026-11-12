import { describe, expect, it } from "vitest";
import { harness } from "./utils/test-harness.js";

/** Lines as a real Meralco bill prints them (labels in the bill's own words). */
const october = [
  { label: "Generation Charge", amount: 1788.24 },
  { label: "Transmission Charge", amount: 251.28 },
  { label: "System Loss Charge", amount: 154.92 },
  { label: "Distribution Charge", amount: 329.09 },
  { label: "Supply Charge (per kWh)", amount: 118.8 },
  { label: "Supply Charge (per customer)", amount: 16.38 },
  { label: "Metering Charge", amount: 5.0 },
  { label: "Universal Charge - Environmental", amount: 0.6 },
  { label: "FIT-All (Renewable)", amount: 20.11 },
  { label: "VAT", amount: 245.15 },
  { label: "Power Act Reduction Adjustment", amount: -12.5 },
];

const september = [
  { label: "Generation Charge", amount: 1436.4 },
  { label: "Transmission Charge", amount: 207.0 },
  { label: "Distribution Charge", amount: 274.24 },
  { label: "Supply Charge (per customer)", amount: 16.38 },
  { label: "Power Act Reduction Adjustment", amount: -10 },
];

const rows = (body: any) => body.groups.flatMap((g: any) => g.rows.map((r: any) => ({ ...r, group: g.key })));
const row = (body: any, label: string) => rows(body).find((r: any) => r.label === label);

describe("POST /api/bills/laman", () => {
  it("labels generation and transmission as pass-through and distribution as Meralco's", async () => {
    const api = await harness();
    const { status, body } = await api.userPost("/api/bills/laman", { now: { chargeLines: october } });

    expect(status).toBe(200);
    expect(row(body, "Generation Charge").payee.type).toBe("passThrough");
    expect(row(body, "Transmission Charge").payee.type).toBe("passThrough");
    expect(row(body, "System Loss Charge").payee.type).toBe("passThrough");
    expect(row(body, "Distribution Charge").payee.type).toBe("meralco");
    expect(row(body, "Generation Charge").what).toMatch(/planta/);
  });

  it("groups Fixed Charges separately from per-kWh charges", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bills/laman", { now: { chargeLines: october } });

    expect(body.groups.map((g: any) => g.key)).toEqual(["perKwh", "fixed", "unclear", "tax", "unknown"]);
    expect(row(body, "Supply Charge (per kWh)").group).toBe("perKwh");
    expect(row(body, "Supply Charge (per customer)").group).toBe("fixed");
    expect(row(body, "VAT").group).toBe("tax");
    // The printed label doesn't say per kWh or per customer: not guessed either way.
    expect(row(body, "Metering Charge")).toMatchObject({ group: "unclear", kind: null, payee: { type: "meralco" } });
  });

  it("never guesses an unknown line", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bills/laman", { now: { chargeLines: october } });
    expect(row(body, "Power Act Reduction Adjustment")).toMatchObject({
      group: "unknown",
      known: false,
      code: null,
      kind: null,
      payee: null,
      what: "Hindi pa namin kilala ang linyang ito.",
      amount: -1250,
    });
  });

  it("group totals add up to the Bill's printed lines, and pass-through vs. Meralco is summed", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bills/laman", { now: { chargeLines: october } });
    const printed = october.reduce((s, l) => s + Math.round(l.amount * 100), 0);
    expect(body.total).toBe(printed);
    expect(body.groups.reduce((s: number, g: any) => s + g.total, 0)).toBe(printed);
    expect(body.split.passThrough).toBe(178_824 + 25_128 + 15_492 + 60 + 2_011);
    expect(body.split.meralco).toBe(32_909 + 11_880 + 1_638 + 500);
  });

  it("shows how each line changed vs. last month", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bills/laman", {
      now: { chargeLines: october },
      before: { chargeLines: september },
    });
    expect(row(body, "Generation Charge").change).toEqual({ status: "changed", amount: 35_184, previous: 143_640 });
    expect(row(body, "Supply Charge (per customer)").change).toEqual({ status: "changed", amount: 0, previous: 1_638 });
    // Per-kWh supply is a different line from per-customer supply.
    expect(row(body, "Supply Charge (per kWh)").change.status).toBe("new");
    expect(row(body, "System Loss Charge").change.status).toBe("new");
    // Unknown lines are matched only by their exact label.
    expect(row(body, "Power Act Reduction Adjustment").change).toEqual({ status: "changed", amount: -250, previous: -1_000 });
  });

  it("says so when last month's Bill has no printed lines", async () => {
    const api = await harness();
    const { body } = await api.userPost("/api/bills/laman", { now: { chargeLines: october }, before: { chargeLines: [] } });
    expect(row(body, "Generation Charge").change).toEqual({ status: "noPrevious", amount: null, previous: null });
  });

  it("accepts whole Bills as sent to /api/bakit-ganito", async () => {
    const api = await harness();
    const { status } = await api.userPost("/api/bills/laman", {
      now: { period: "2026-10", kwh: 240, billingDays: 32, chargeLines: october },
      before: { period: "2026-09", kwh: 200, billingDays: 30 },
    });
    expect(status).toBe(200);
  });

  it("returns 400 when the Bill has no charge lines", async () => {
    const api = await harness();
    const { status, body } = await api.userPost("/api/bills/laman", { now: { chargeLines: [] } });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toMatch(/Walang charge line/);
  });
});
