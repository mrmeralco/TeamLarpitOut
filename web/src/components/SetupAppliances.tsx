import { useRef, useState } from "react";
import { ApiError, setupApi, type GridTile, type SetupStatus } from "../api/client";

const ICON: Record<string, string> = {
  aircon: "❄", refrigerator: "🧊", electric_fan: "🌀", tv: "📺", washing_machine: "🧺", rice_cooker: "🍚", flat_iron: "👕", computer: "💻", other: "🔌",
};
const LONG_PRESS_MS = 500;
const MAX = 9;

/**
 * Setup step 2 (mockup screen 10): tap adds one, tap again adds another, long-press removes.
 * Typical values only; no wattage or model fields. Optional aircon photo for a closer size.
 */
export function SetupAppliances({ token, sin, status, onSaved, onBack, onExpired }: {
  token: string; sin: string; status: SetupStatus; onSaved: (s: SetupStatus) => void; onBack: () => void; onExpired: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ ...(status.grid ?? {}) }));
  const [tiles, setTiles] = useState<GridTile[]>(status.gridCatalog ?? []);
  const [busy, setBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const press = useRef<{ timer: number; long: boolean } | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  const set = (type: string, n: number) => setCounts((c) => ({ ...c, [type]: Math.max(0, Math.min(MAX, n)) }));
  const startPress = (type: string) => {
    const timer = window.setTimeout(() => { if (press.current) press.current.long = true; set(type, 0); }, LONG_PRESS_MS);
    press.current = { timer, long: false };
  };
  const endPress = () => { if (press.current) window.clearTimeout(press.current.timer); };
  const tap = (type: string) => {
    const long = press.current?.long;
    press.current = null;
    if (!long) set(type, (counts[type] ?? 0) + 1);
  };

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) onExpired();
    else setError(err instanceof Error ? err.message : fallback);
  };

  async function onPhoto(file: File) {
    setBusy(true); setError(null); setPhotoNote(null);
    try {
      const out = await setupApi.airconPhoto(token, sin, file);
      setTiles((ts) => ts.map((t) => (t.type === "aircon" ? { ...t, kwh: out.kwhPerHour, tag: out.tag } : t)));
      if (!counts.aircon) set("aircon", 1);
      setPhotoNote(`About ${out.kwhPerHour} kWh per hour · Estimated from photo`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setPhotoNote(err instanceof Error ? err.message : "Typical value muna.");
    } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try { onSaved(await setupApi.grid(token, sin, Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)))); }
    catch (err) { fail(err, "Hindi ma-save."); } finally { setBusy(false); }
  }

  return (
    <section className="flow" aria-labelledby="setup-grid-title">
      <div className="card-head"><button type="button" className="back" aria-label="Back" onClick={onBack}>‹</button><span className="muted small">Setup 2 of 3</span></div>
      <h2 id="setup-grid-title">Which of these do you have?</h2>
      <p className="muted">Just tap. We use typical values for each, and your total always matches your actual bill.</p>
      <ul className="grid-tiles">
        {tiles.map((t) => {
          const n = counts[t.type] ?? 0;
          return (
            <li key={t.type} className={n > 0 ? "on" : ""}>
              <button type="button" className="tile"
                aria-label={`${t.label}${n ? `, ${n}` : ""}. ${n ? "Tap to add another; long-press to remove" : "Tap to add"}`}
                onPointerDown={() => startPress(t.type)} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
                onContextMenu={(e) => e.preventDefault()} onClick={() => tap(t.type)}>
                <span className="tile-icon" aria-hidden="true">{ICON[t.type] ?? "🔌"}</span>
                <span className="tile-label">{t.label}</span>
                <span className="tile-kwh muted">{t.kwh} {t.unit.replace("kWh ", "kWh/").replace("per ", "")}</span>
                <span className={`tile-tag ${t.tag === "Estimated from photo" ? "photo" : ""}`}>{t.tag}</span>
                {n > 0 && <span className="tile-count" aria-hidden="true">{n}</span>}
              </button>
              {n > 0 && <button type="button" className="tile-remove" aria-label={`Remove ${t.label}`} onClick={() => set(t.type, 0)}>×</button>}
            </li>
          );
        })}
      </ul>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onPhoto(f); }} />
      <button type="button" className="ghost wide" disabled={busy} onClick={() => photo.current?.click()}>
        📷 Optional: snap your aircon <span className="muted small">· for a closer estimate of its size</span>
      </button>
      {photoNote && <p className="small muted" role="status">{photoNote}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="primary" disabled={busy || total === 0} onClick={() => void save()}>
        Continue · {total} {total === 1 ? "appliance" : "appliances"}
      </button>
      <p className="small muted center">Tap again to change the count. Long-press to remove.</p>
    </section>
  );
}
