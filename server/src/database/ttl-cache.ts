/**
 * A small per-process cache for database reads. Supabase is a ~300 ms round trip away and one
 * request reads the same rows several times (the guards, then the service), so repositories keep
 * what they read for a short while and update or drop it on every write they make. Values are
 * cloned in and out, so callers can never change a cached copy. With more than one API instance,
 * a write on another instance shows here once the entry expires (ttlMs).
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { at: number; value: Promise<V> }>();

  constructor(private readonly ttlMs: number, private readonly now: () => number = () => Date.now()) {}

  async get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.entries.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return structuredClone(await hit.value);
    const value = load();
    this.entries.set(key, { at: this.now(), value });
    try {
      return structuredClone(await value);
    } catch (err) {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
      throw err;
    }
  }

  set(key: string, value: V) {
    this.entries.set(key, { at: this.now(), value: Promise.resolve(structuredClone(value)) });
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}
