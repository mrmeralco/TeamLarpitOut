import { useState } from "react";
import { ApiError, setupApi, type SetupStatus } from "../api/client";

/** Setup step 1: only how many people live there. */
export function SetupHousehold({ token, sin, status, onSaved, onBack, onExpired }: {
  token: string; sin: string; status: SetupStatus; onSaved: (s: SetupStatus) => void; onBack: () => void; onExpired: () => void;
}) {
  const [size, setSize] = useState(status.household?.size ?? 3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try { onSaved(await setupApi.household(token, sin, size)); }
    catch (err) { if (err instanceof ApiError && err.status === 401) onExpired(); else setError(err instanceof Error ? err.message : "Couldn't save."); }
    finally { setBusy(false); }
  }
  return (
    <section className="flow" aria-labelledby="setup-household-title">
      <div className="card-head"><button type="button" className="back" aria-label="Back" onClick={onBack}>‹</button><span className="muted small">Setup 1 of 3</span></div>
      <h2 id="setup-household-title">Who lives there?</h2>
      <p className="muted">Only the number of people. Nothing else about you is asked.</p>
      <div className="stepper" role="group" aria-label="People in the home">
        <button type="button" aria-label="Fewer people" disabled={size <= 1} onClick={() => setSize((n) => Math.max(1, n - 1))}>−</button>
        <output aria-live="polite">{size} {size === 1 ? "person" : "people"}</output>
        <button type="button" aria-label="More people" disabled={size >= 20} onClick={() => setSize((n) => Math.min(20, n + 1))}>+</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>Continue</button>
    </section>
  );
}
