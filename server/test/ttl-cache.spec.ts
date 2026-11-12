import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/database/ttl-cache.js";

describe("TtlCache", () => {
  it("loads once while fresh, shares one in-flight load, and reloads after the TTL", async () => {
    let now = 0;
    let loads = 0;
    const cache = new TtlCache<{ n: number }>(1000, () => now);
    const load = async () => ({ n: ++loads });
    const [a, b] = await Promise.all([cache.get("k", load), cache.get("k", load)]);
    expect(loads).toBe(1);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    now = 999;
    await cache.get("k", load);
    expect(loads).toBe(1);
    now = 1000;
    expect(await cache.get("k", load)).toEqual({ n: 2 });
  });

  it("returns copies, so a caller can't change what is cached", async () => {
    const cache = new TtlCache<{ list: number[] }>(1000, () => 0);
    const first = await cache.get("k", async () => ({ list: [1] }));
    first.list.push(2);
    expect(await cache.get("k", async () => ({ list: [9] }))).toEqual({ list: [1] });
  });

  it("set and delete follow writes; a failed load isn't kept", async () => {
    const cache = new TtlCache<number>(1000, () => 0);
    cache.set("k", 5);
    expect(await cache.get("k", async () => 1)).toBe(5);
    cache.delete("k");
    expect(await cache.get("k", async () => 7)).toBe(7);
    await expect(cache.get("x", async () => { throw new Error("db down"); })).rejects.toThrow("db down");
    expect(await cache.get("x", async () => 3)).toBe(3);
  });
});
