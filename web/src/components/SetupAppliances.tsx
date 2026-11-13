import { useRef, useState } from "react";
import { ApiError, setupApi, type GridTile, type SetupStatus } from "../api/client";
import { EelioLoader } from "./EelioLoader";

const PHOTO_STEPS = [
  "Sending your photo",
  "Recognising the appliance",
  "Estimating its size from what's visible",
] as const;

const ICON: Record<string, string> = {
  aircon: "M3 5h18v8H3zM7 17l-1 3M12 17v3M17 17l1 3M7 9h10",
  refrigerator: "M6 2h12v20H6zM6 10h12M9 5v2M9 13v3",
  electric_fan: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 10c0-4 2-7 5-6s1 5-3 6M14 12c4 0 7 2 6 5s-5 1-6-3M10 12c-4 0-7-2-6-5s5-1 6 3M12 14v7",
  tv: "M3 6h18v11H3zM8 21h8M12 17v4",
  washing_machine: "M5 3h14v18H5zM5 8h14M12 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  rice_cooker: "M4 10h16v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM6 10a6 4 0 0 1 12 0M12 4v2",
  flat_iron: "M3 17h18l-2-7a4 4 0 0 0-4-3H9M3 17l2-4h8M7 20h10",
  computer: "M3 4h18v12H3zM8 20h8M12 16v4",
  other: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

const Svg = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const LONG_PRESS_MS = 500;
const MAX = 9;

const sameCounts = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? 0) === (b[k] ?? 0));
};

/**
 * Setup step 2 (mockup screen 10): tap adds one, tap again adds another, long-press removes.
 * Typical values only; no wattage or model fields. Optional photo of any appliance: it is recognised,
 * added to the grid, and its tile gets a closer rating when the photo shows enough.
 *
 * After setup is complete the same grid edits the appliance list (`mode="edit"`): saving replaces the
 * list, and the Mission Plan is rebuilt for it.
 */
export function SetupAppliances({ token, sin, status, mode = "setup", onSaved, onBack, onExpired }: {
  token: string; sin: string; status: SetupStatus; mode?: "setup" | "edit";
  onSaved: (s: SetupStatus) => void; onBack: () => void; onExpired: () => void;
}) {
  const editing = mode === "edit";
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ ...(status.grid ?? {}) }));
  const [tiles, setTiles] = useState<GridTile[]>(status.gridCatalog ?? []);
  const [busy, setBusy] = useState(false);
  /** A photo is uploading and being read (several seconds): shows Eelio's loader instead of the button. */
  const [reading, setReading] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const press = useRef<{ timer: number; long: boolean } | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const changed = !editing || photoChanged || !sameCounts(counts, status.grid ?? {});

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
    setBusy(true); setReading(true); setError(null); setPhotoNote(null);
    try {
      const out = await setupApi.appliancePhoto(token, sin, file);
      if (out.tag === "Estimated from photo") {
        setTiles((ts) => ts.map((t) => (t.type === out.type ? { ...t, kwh: out.kwh, tag: out.tag } : t)));
        setPhotoChanged(true);
      }
      if (!counts[out.type]) set(out.type, 1);
      setPhotoNote(out.tag === "Estimated from photo"
        ? `${out.label}: about ${out.kwh} ${out.unit} · Estimated from photo`
        : `${out.label} added · the photo didn't show its size, so the typical value is used`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setPhotoNote(err instanceof Error ? err.message : "Tap the appliance instead for now.");
    } finally { setBusy(false); setReading(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try { onSaved(await setupApi.grid(token, sin, Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)))); }
    catch (err) { fail(err, "Couldn't save."); } finally { setBusy(false); }
  }

  return (
    <section className="flow" aria-labelledby="setup-grid-title">
      <div className="card-head"><button type="button" className="back" aria-label="Back" onClick={onBack}>‹</button><span className="muted small">{editing ? "Your appliances" : "Setup 2 of 3"}</span></div>
      <h2 id="setup-grid-title">{editing ? "Edit your appliances" : "Which of these do you have?"}</h2>
      <p className="muted">{editing
        ? "Bought, replaced or got rid of something? Change the counts. Your total still matches your actual bill."
        : "Just tap. We use typical values for each, and your total always matches your actual bill."}</p>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onPhoto(f); }} />
      {reading ? (
        <div className="photo-reading">
          <EelioLoader compact variant="appliances" badge="Appliance Detective" title="Reading your photo…" steps={PHOTO_STEPS} role="status" />
        </div>
      ) : (
        <button type="button" className="snap-appliance-btn" disabled={busy} onClick={() => photo.current?.click()}>
          <span className="snap-appliance-icon" aria-hidden="true">
            <Svg d={ICON.camera} size={22} />
          </span>
          <span className="snap-appliance-copy">
            <span className="snap-appliance-head">
              <strong>Snap an appliance</strong>
              <span className="snap-appliance-pill">Photo estimate</span>
            </span>
            <span className="snap-appliance-sub">Take a photo: we'll recognise it and estimate its size</span>
          </span>
          <span className="snap-appliance-action" aria-hidden="true">Snap ›</span>
        </button>
      )}
      {photoNote && <p className="snap-appliance-note" role="status">{photoNote}</p>}
      <ul className="grid-tiles">
        {tiles.map((t) => {
          const n = counts[t.type] ?? 0;
          return (
            <li key={t.type} className={n > 0 ? "on" : ""}>
              <button type="button" className="tile"
                aria-label={`${t.label}${n ? `, ${n}` : ""}. ${n ? "Tap to add another; long-press to remove" : "Tap to add"}`}
                onPointerDown={() => startPress(t.type)} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
                onContextMenu={(e) => e.preventDefault()} onClick={() => tap(t.type)}>
                <span className="tile-icon" aria-hidden="true"><Svg d={ICON[t.type] ?? ICON.other} /></span>
                <span className="tile-label">{t.label}</span>
                <span className="tile-kwh muted">{t.kwh} {t.unit.replace("kWh ", "kWh/").replace("per ", "")}</span>
                <span className={`tile-tag ${t.tag === "Estimated from photo" ? "photo" : ""}`}>{t.tag}</span>
              </button>
              {n > 0 && (
                <div className="tile-dock" role="group" aria-label={`${t.label} quantity`}>
                  <button
                    type="button"
                    className="tile-dock-btn"
                    aria-label={n === 1 ? `Remove ${t.label}` : `Decrease ${t.label}`}
                    onClick={() => set(t.type, n - 1)}
                  >
                    −
                  </button>
                  <span className="tile-dock-count" aria-hidden="true">{n}</span>
                  <button
                    type="button"
                    className="tile-dock-btn"
                    aria-label={`Increase ${t.label}`}
                    disabled={n >= MAX}
                    onClick={() => set(t.type, n + 1)}
                  >
                    +
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      {editing && changed && <p className="small muted" role="note">Saving updates your missions to match.</p>}
      <button type="button" className="primary" disabled={busy || total === 0 || !changed} onClick={() => void save()}>
        {editing ? "Save changes" : "Continue"} · {total} {total === 1 ? "appliance" : "appliances"}
      </button>
      <p className="small muted center">Tap a tile to add it, then use − or + to adjust the count.</p>
    </section>
  );
}
