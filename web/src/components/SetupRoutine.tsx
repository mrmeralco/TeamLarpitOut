import { useState } from "react";
import { ApiError, setupApi, type AirconPattern, type HomePattern, type SetupStatus } from "../api/client";

export const HOME_CHOICES: { value: HomePattern; label: string; hint: string }[] = [
  { value: "allDay", label: "Almost all day", hint: "Someone stays home on weekdays" },
  { value: "eveningsWeekends", label: "Evenings and weekends", hint: "Out for work or school on weekdays" },
  { value: "daytime", label: "Mostly daytime", hint: "Night shift or away at night" },
];
export const AIRCON_CHOICES: { value: AirconPattern; label: string }[] = [
  { value: "sleeping", label: "Sleeping only" },
  { value: "afternoonNight", label: "Afternoon + night" },
  { value: "mostOfDay", label: "Most of the day" },
];

/** Setup step 3: one routine for the whole home (ADR-0006). The aircon question is hidden without an aircon. */
export function SetupRoutine({ token, sin, status, onSaved, onBack, onExpired, agreement }: {
  token: string; sin: string; status: SetupStatus; onSaved: (s: SetupStatus) => void; onBack: () => void; onExpired: () => void;
  /** e.g. "Your 12 bills agree: about 8 hours a night" for the chosen aircon pattern. */
  agreement?: (aircon: AirconPattern) => React.ReactNode;
}) {
  const [home, setHome] = useState<HomePattern | null>(status.routine?.home ?? null);
  const [aircon, setAircon] = useState<AirconPattern | null>(status.routine?.aircon ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = home !== null && (!status.hasAircon || aircon !== null);
  async function save() {
    if (!home) return;
    setBusy(true); setError(null);
    try { onSaved(await setupApi.routine(token, sin, home, status.hasAircon ? aircon : null)); }
    catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); else setError(err instanceof Error ? err.message : "Couldn't save."); }
    finally { setBusy(false); }
  }
  return (
    <section className="flow" aria-labelledby="setup-routine-title">
      <div className="card-head"><button type="button" className="back" aria-label="Back" onClick={onBack}>‹</button><span className="muted small">Setup 3 of 3</span></div>
      <h2 id="setup-routine-title">What does a typical day look like?</h2>
      <p className="muted">Two quick picks. No need to count hours per appliance.</p>
      <fieldset className="choices">
        <legend>When is someone usually home?</legend>
        {HOME_CHOICES.map((c) => (
          <label key={c.value} className={`choice ${home === c.value ? "on" : ""}`}>
            <input type="radio" name="home" value={c.value} checked={home === c.value} onChange={() => setHome(c.value)} />
            <span><strong>{c.label}</strong><span className="muted small">{c.hint}</span></span>
          </label>
        ))}
      </fieldset>
      {status.hasAircon && <fieldset className="choices">
        <legend>When is the aircon usually on?</legend>
        {AIRCON_CHOICES.map((c) => (
          <label key={c.value} className={`choice ${aircon === c.value ? "on" : ""}`}>
            <input type="radio" name="aircon" value={c.value} checked={aircon === c.value} onChange={() => setAircon(c.value)} />
            <span><strong>{c.label}</strong></span>
          </label>
        ))}
        {aircon && agreement?.(aircon)}
      </fieldset>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="primary" disabled={busy || !ready} onClick={() => void save()}>
        {status.complete ? "Save routine" : `Finish setup · get ${status.welcomePoints.points} pts`}
      </button>
    </section>
  );
}
