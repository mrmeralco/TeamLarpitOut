import { createHash } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { DAY_MS, HOUR_MS, type HourlyReading, type ReadingRange } from "../src/domain/meter-reading.js";
import { mockMyMeralcoSource } from "../src/bills/myMeralcoSource.js";
import { MockReadingSource } from "../src/smart-meter/mock-reading-source.provider.js";
import { inMemoryReadingSource, type ReadingSource } from "../src/smart-meter/reading-source.interface.js";
import { harness, testLogins } from "./utils/test-harness.js";

const SMART = "9876543210";
const OTHER_SMART = "1111111111";
const FROM = "2026-11-02T00:00:00+08:00"; // Monday in Manila, Sunday in UTC.
const TO = "2026-11-03T00:00:00+08:00";
const iso = (timestamp: number) => new Date(timestamp).toISOString();
const path = (query: Partial<Record<"from" | "to" | "interval", string>> = { from: FROM, to: TO, interval: "day" }, sin = SMART) =>
  `/api/households/${sin}/readings?${new URLSearchParams(Object.entries(query).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, value]]))}`;
const hours = (from: string, count: number, wh = 1000): HourlyReading[] => Array.from({ length: count }, (_, i) => ({
  from: iso(Date.parse(from) + i * HOUR_MS), wh,
}));

function sourceSpy(rows = hours(FROM, 24)) {
  const source = inMemoryReadingSource({ [SMART]: rows });
  return { describe: vi.fn(source.describe), readings: vi.fn(source.readings) };
}

describe("GET /api/households/:sin/readings", () => {
  it("forwards SIN and the normalized half-open range to an injected source, with no-store", async () => {
    const source = sourceSpy(hours(FROM, 4, 333).reverse());
    const api = await harness({ readingSource: source });
    const token = await api.login();
    const to = "2026-11-02T03:00:00+08:00";
    const response = await request(api.app.getHttpServer()).get(path({ from: FROM, to, interval: "hour" }))
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      sin: SMART, interval: "hour", timeZone: "Asia/Manila",
      range: { from: "2026-11-01T16:00:00.000Z", to: "2026-11-01T19:00:00.000Z" },
      provenance: { kind: "synthetic" },
    });
    expect(response.body.readings).toEqual([0, 1, 2].map((i) => ({
      from: iso(Date.parse(FROM) + i * HOUR_MS), to: iso(Date.parse(FROM) + (i + 1) * HOUR_MS),
      kwh: 0.333, partial: false,
    })));
    expect(source.describe).toHaveBeenCalledExactlyOnceWith(SMART);
    expect(source.readings).toHaveBeenCalledExactlyOnceWith(SMART, response.body.range);
  });

  it("sums integer Wh into complete Manila days and Monday weeks without rounding per hour", async () => {
    const api = await harness({ readings: { [SMART]: hours(FROM, 168, 333) } });
    const token = await api.login();
    const to = "2026-11-09T00:00:00+08:00";
    const daily = await api.get(path({ from: FROM, to, interval: "day" }), token);
    expect(daily.status).toBe(200);
    expect(daily.body.readings).toHaveLength(7);
    expect(daily.body.readings.every((row: any) => row.kwh === 7.992 && !row.partial)).toBe(true);
    const weekly = await api.get(path({ from: FROM, to, interval: "week" }), token);
    expect(weekly.body.readings).toEqual([{
      from: "2026-11-01T16:00:00.000Z", to: "2026-11-08T16:00:00.000Z", kwh: 55.944, partial: false,
    }]);
  });

  it.each(["day", "week"])("splits at Manila Monday midnight and clips partial %s boundaries", async (interval) => {
    const from = "2026-11-01T23:00:00+08:00";
    const to = "2026-11-02T02:00:00+08:00";
    const api = await harness({ readings: { [SMART]: hours(from, 3).map((row, i) => ({ ...row, wh: (i + 1) * 1000 })) } });
    const response = await api.get(path({ from, to, interval }), await api.login());
    expect(response.body.readings).toEqual([
      { from: "2026-11-01T15:00:00.000Z", to: "2026-11-01T16:00:00.000Z", kwh: 1, partial: true },
      { from: "2026-11-01T16:00:00.000Z", to: "2026-11-01T18:00:00.000Z", kwh: 5, partial: true },
    ]);
  });

  it("preserves measured zeroes and marks missing hours partial instead of inventing zero usage", async () => {
    const rows = hours(FROM, 24, 0).filter((_, i) => i !== 12);
    const api = await harness({ readings: { [SMART]: rows } });
    const token = await api.login();
    expect((await api.get(path(), token)).body.readings).toEqual([{
      from: "2026-11-01T16:00:00.000Z", to: "2026-11-02T16:00:00.000Z", kwh: 0, partial: true,
    }]);
    const hourly = await api.get(path({ from: FROM, to: TO, interval: "hour" }), token);
    expect(hourly.body.readings).toHaveLength(23);
    expect(hourly.body.readings.every((row: any) => row.kwh === 0 && !row.partial)).toBe(true);
  });

  it("returns empty data for an empty source and ranges outside available data", async () => {
    const api = await harness();
    const token = await api.login();
    expect(await api.get(path(), token)).toMatchObject({ status: 200, body: { available: null, readings: [] } });
    expect(await api.get(path({}), token)).toMatchObject({ status: 200, body: { range: null, available: null, readings: [] } });
    const populated = await harness({ readings: { [SMART]: hours(FROM, 24) } });
    const response = await populated.get(path({ from: TO, to: "2026-11-04T00:00:00+08:00" }), await populated.login());
    expect(response.status).toBe(200);
    expect(response.body.readings).toEqual([]);
    expect(response.body.available).not.toBeNull();
  });

  it.each([
    { from: FROM }, { to: TO }, { from: "", to: TO },
    { from: "not-a-date", to: TO }, { from: "2026-02-30T00:00:00+08:00", to: TO },
    { from: "2026-02-29T00:00:00+08:00", to: TO },
    { from: "2026-11-02T00:00:00", to: TO },
    { from: "2026-11-02T24:00:00+08:00", to: TO },
    { from: "2026-11-02T00:30:00+08:00", to: TO },
    { from: "2026-11-02T00:00:01+08:00", to: TO },
    { from: "2026-11-02T00:00:00.001+08:00", to: TO },
    { from: "2026-11-02T00:00:00+08:30", to: TO },
    { from: TO, to: FROM }, { from: FROM, to: FROM },
    { from: "2025-01-01T00:00:00Z", to: "2026-01-03T00:00:00Z" },
    { interval: "month" }, { interval: "" },
  ])("rejects invalid query %j before accessing the source", async (query) => {
    const source = sourceSpy();
    const api = await harness({ readingSource: source });
    expect((await api.get(path(query), await api.login())).status).toBe(400);
    expect(source.describe).not.toHaveBeenCalled();
    expect(source.readings).not.toHaveBeenCalled();
  });

  it("rejects repeated query parameters instead of coercing arrays", async () => {
    const source = sourceSpy();
    const api = await harness({ readingSource: source });
    const token = await api.login();
    for (const extra of ["&interval=hour", "&from=2026-11-02T00:00:00Z"]) {
      expect((await api.get(path() + extra, token)).status).toBe(400);
    }
    expect(source.describe).not.toHaveBeenCalled();
  });

  it("accepts UTC offsets representing the same instants and the 366-day upper bound", async () => {
    const api = await harness({ readings: { [SMART]: hours(FROM, 24) } });
    const token = await api.login();
    const utc = await api.get(path({ from: "2026-11-01T16:00:00Z", to: "2026-11-02T16:00:00Z" }), token);
    expect(utc).toEqual(await api.get(path(), token));
    expect((await api.get(path({ from: "2024-01-01T00:00:00Z", to: "2025-01-01T00:00:00Z" }), token)).status).toBe(200);
  });

  it("never touches readings without a valid session or for unlinked/unknown/traditional Households", async () => {
    const source = sourceSpy();
    const api = await harness({ readingSource: source });
    for (const sin of [SMART, "1234567890", "unknown"]) {
      expect((await api.get(path(undefined, sin))).status).toBe(401);
      expect((await api.get(path(undefined, sin), "invalid-token")).status).toBe(401);
    }
    const token = await api.login();
    const foreign = await api.get(path(undefined, "5555555555"), token);
    expect(foreign).toEqual(await api.get(path(undefined, "unknown"), token));
    expect(foreign).toEqual({ status: 404, body: { error: "Hindi makita ang Household." } });
    expect((await api.get(path(undefined, "1234567890"), token)).status).toBe(422);
    await api.post("/api/auth/logout", {}, token);
    expect((await api.get(path(), token)).status).toBe(401);
    expect(source.describe).not.toHaveBeenCalled();
    expect(source.readings).not.toHaveBeenCalled();
  });

  it("checks current server membership and Meter Type, and denies expired sessions", async () => {
    const source = sourceSpy();
    const base = mockMyMeralcoSource(testLogins);
    let meterType: "smart" | "traditional" = "traditional";
    let linked = true;
    let now = 0;
    const api = await harness({ readingSource: source, clock: { now: () => now }, myMeralco: {
      login: base.login,
      households: async () => linked ? [{ sin: SMART, masked_address: "••• City", meter_type: meterType }] : [],
    } });
    const token = await api.login();
    expect((await api.get(path(), token)).status).toBe(422);
    meterType = "smart";
    linked = false;
    expect((await api.get(path(), token)).status).toBe(404);
    linked = true;
    now = 60 * 60 * 1000;
    expect((await api.get(path(), token)).status).toBe(401);
    expect(source.describe).not.toHaveBeenCalled();
  });

  it("isolates two smart Households across repeated switching and source failures", async () => {
    const accounts = structuredClone(testLogins);
    accounts[0]!.households.push({ sin: OTHER_SMART, masked_address: "••• Other", meter_type: "smart" });
    const memory = inMemoryReadingSource({ [SMART]: hours(FROM, 24), [OTHER_SMART]: hours(FROM, 24, 2000) });
    let fail = false;
    const source: ReadingSource = { describe: memory.describe, readings: async (sin, range) => {
      if (fail && sin === OTHER_SMART) throw new Error("private upstream failure details");
      return memory.readings(sin, range);
    } };
    const api = await harness({ myMeralco: mockMyMeralcoSource(accounts), readingSource: source });
    const token = await api.login();
    const first = await api.get(path(), token);
    const second = await api.get(path(undefined, OTHER_SMART), token);
    expect(first.body.readings[0].kwh).toBe(24);
    expect(second.body.readings[0].kwh).toBe(48);
    expect(second.body.sin).toBe(OTHER_SMART);
    expect(await api.get(path(), token)).toEqual(first);
    fail = true;
    expect(await api.get(path(undefined, OTHER_SMART), token)).toEqual({
      status: 502, body: { error: "Hindi makuha ang smart meter readings. Subukan ulit." },
    });
    const otherOwner = await api.login("owner-b@example.test", "test-password-b");
    expect((await api.get(path(), otherOwner)).status).toBe(404);
  });

  it("maps metadata failures to 502 without calling readings", async () => {
    const source = sourceSpy();
    source.describe.mockRejectedValue(new Error("private details"));
    const api = await harness({ readingSource: source });
    expect(await api.get(path(), await api.login())).toEqual({
      status: 502, body: { error: "Hindi makuha ang smart meter readings. Subukan ulit." },
    });
    expect(source.readings).not.toHaveBeenCalled();
  });

  it.each([
    [{ from: FROM, wh: -1 }], [{ from: FROM, wh: 1.5 }], [{ from: FROM, wh: Number.MAX_SAFE_INTEGER + 1 }],
    [{ from: FROM, wh: 1 }, { from: FROM, wh: 1 }], [{ from: TO, wh: 1 }],
    [{ from: "2026-11-02T00:30:00+08:00", wh: 1 }], [{ from: "invalid", wh: 1 }],
  ])("rejects malformed upstream hourly data %#", async (...rows) => {
    const source = sourceSpy();
    source.readings.mockResolvedValue(rows);
    const api = await harness({ readingSource: source });
    expect((await api.get(path(), await api.login())).status).toBe(502);
  });
});

describe("default mock smart meter source", () => {
  it("serves the full deterministic twelve-month simulation and advertises it through HTTP", async () => {
    const source = new MockReadingSource();
    const metadata = await source.describe(SMART);
    expect(metadata.available).toEqual({ from: "2025-12-01T00:00:00+08:00", to: "2026-12-01T00:00:00+08:00" });
    const rows = await source.readings(SMART, metadata.available!);
    expect(rows).toHaveLength(365 * 24);
    // Golden checksum recorded before extracting the shared daily climate (issue #14).
    expect(createHash("sha256").update(JSON.stringify(rows)).digest("hex"))
      .toBe("140ce55b78a78e11aa81e94e2a4b189806095fa137b31ac60055fa25c644c4ef");
    expect(rows.every((row) => Number.isSafeInteger(row.wh) && row.wh >= 0)).toBe(true);
    const subset: ReadingRange = { from: FROM, to: TO };
    expect(await source.readings(SMART, subset)).toEqual(rows.filter((row) =>
      Date.parse(row.from) >= Date.parse(FROM) && Date.parse(row.from) < Date.parse(TO)));
    const snapshot = await source.readings(SMART, subset);
    snapshot[0]!.wh = -1;
    expect((await source.readings(SMART, subset))[0]!.wh).toBeGreaterThan(0);
    expect((await source.describe("unknown")).available).toBeNull();
    expect(await source.readings("unknown", subset)).toEqual([]);

    const api = await harness({ readingSource: source, myMeralco: mockMyMeralcoSource() });
    const token = await api.login("demo@example.com", "kuryenteko-demo");
    for (const [interval, duration] of [["hour", DAY_MS], ["day", 30 * DAY_MS], ["week", 84 * DAY_MS]] as const) {
      const response = await api.get(path({ interval }), token);
      expect(response.status).toBe(200);
      expect(response.body.provenance).toMatchObject({ kind: "synthetic", note: expect.stringContaining("invented temperatures") });
      expect(response.body.available).toEqual(metadata.available);
      expect(Date.parse(response.body.range.to) - Date.parse(response.body.range.from)).toBe(duration);
      expect(response.body.readings.length).toBeGreaterThan(0);
    }
    const daily = await api.get(path({}), token);
    expect(daily.body.interval).toBe("day");
    expect(daily.body.readings).toHaveLength(30);
  });

  it("sustains overnight aircon load and increases it on hotter synthetic days", async () => {
    const source = new MockReadingSource();
    const cool = await source.readings(SMART, { from: "2026-01-01T00:00:00+08:00", to: "2026-01-02T00:00:00+08:00" });
    const hot = await source.readings(SMART, { from: "2026-05-01T00:00:00+08:00", to: "2026-05-02T00:00:00+08:00" });
    for (const hour of [0, 1, 2, 3, 4, 5, 22, 23]) {
      expect(cool[hour]!.wh).toBeGreaterThan(cool[12]!.wh);
      expect(hot[hour]!.wh).toBeGreaterThan(cool[hour]!.wh);
    }
    expect(hot[12]!.wh).toBe(cool[12]!.wh);
    expect(cool[19]!.wh).toBeGreaterThan(cool[12]!.wh);
  });
});
