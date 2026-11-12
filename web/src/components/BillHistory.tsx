import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type BakitGanito, type BillChecksResult, type Household } from "../api/client";
import { BillChecks } from "./BillChecks";

/**
 * The detailed "why it changed" explanation and the Bill Checks under Home. Both are built from the
 * Bill History, which is no longer listed month by month. Parent keys this component by session and
 * SIN so old data disappears immediately.
 */
export function BillHistory({ token, household, onExpired, renderExplanation }: {
  token: string; household: Household; onExpired: () => void; renderExplanation: (r: BakitGanito) => ReactNode;
}) {
  const [explanation, setExplanation] = useState<BakitGanito | null>(null);
  const [checks, setChecks] = useState<BillChecksResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setExplanation(null); setChecks(null); setError(null); setExplanationError(null);
    async function load() {
      try {
        const history = await api.history(token, household.sin, controller.signal);
        if (!active) return;
        if (history.length >= 2) {
          try {
            const [result, checksResult] = await Promise.all([
              api.householdExplanation(token, household.sin, controller.signal),
              api.householdBillChecks(token, household.sin, controller.signal).catch(() => null),
            ]);
            if (active) {
              setExplanation(result);
              setChecks(checksResult);
            }
          } catch (err) {
            if (!active) return;
            if (err instanceof ApiError && err.status === 401) onExpired();
            else setExplanationError(err instanceof Error ? err.message : "Couldn't get the explanation.");
          }
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onExpired();
        else setError(err instanceof Error ? err.message : "Couldn't get the Bill History.");
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [token, household.sin, attempt, onExpired]);
  // The 12-month table is no longer shown; the History still drives the explanation and the checks.
  return <>
    {error && <section className="card" role="alert"><p className="error">{error}</p><button className="ghost" onClick={() => setAttempt((n) => n + 1)}>Try again</button></section>}
    {explanationError && <p className="error" role="alert">{explanationError}</p>}
    {explanation && <div id="bakit-ganito" className="anchor">{renderExplanation(explanation)}</div>}
    {checks && <div id="tama-ba" className="anchor"><BillChecks data={checks} /></div>}
  </>;
}
