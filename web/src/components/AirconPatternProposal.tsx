import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, appliancesApi, type AirconPatternResult, type ApplianceInput } from "../api/client";

/** A tentative pattern only changes the survey after "Yes", and persists through the existing save. */
export function AirconPatternProposal(props: {
  token: string; sin: string; value: ApplianceInput; allowProposal: boolean;
  onChange: (value: ApplianceInput) => void; onExpired: () => void; children: ReactNode;
}) {
  const { token, sin, value, allowProposal } = props;
  const inputKey = JSON.stringify({ quantity: value.quantity, answers: value.answers, energyLabel: value.energyLabel });
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${token}:${sin}:${inputKey}:${attempt}`;
  const [mode, setMode] = useState<"proposal" | "manual">((value.timeRanges?.length ?? 0) > 0 ? "manual" : "proposal");
  const [response, setResponse] = useState<{ key: string; result: AirconPatternResult } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const onExpired = useRef(props.onExpired);
  onExpired.current = props.onExpired;

  useEffect(() => {
    if (mode !== "proposal" || !allowProposal) return;
    const controller = new AbortController();
    appliancesApi.airconPattern(token, sin, JSON.parse(inputKey), controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setResponse({ key: requestKey, result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onExpired.current();
        else { setFailedKey(requestKey); setMode("manual"); }
      });
    return () => controller.abort();
  }, [token, sin, inputKey, requestKey, mode, allowProposal]);

  // A changed draft hides old evidence immediately, before the new effect resolves.
  const result = response?.key === requestKey ? response.result : null;
  const proposal = result?.canPropose ? result : null;
  if (!allowProposal || mode === "manual" || result?.canPropose === false) return <>
    {!allowProposal && <p className="muted">There is more than one aircon in the list. Enter a routine for each.</p>}
    {confirmed && <p className="muted">Hours confirmed. Save to use the routine.</p>}
    {(result?.canPropose === false || failedKey === requestKey) &&
      <p className="muted">Not enough of a pattern right now. Enter the routine for now.</p>}
    {props.children}
    {allowProposal && <button type="button" className="ghost" onClick={() => {
      setResponse(null); setFailedKey(null); setAttempt((current) => current + 1); setMode("proposal");
    }}>Check the smart meter pattern</button>}
  </>;

  return <div className="proposal-box" aria-live="polite">
    {proposal ? <>
      <p className="proposal-prompt">{proposal.prompt}</p>
      <p className="muted">Estimated from hourly readings; you confirm it.</p>
      <p className="muted">Simulated readings and temperatures; not actual measurements.</p>
      <div className="row proposal-actions">
        <button type="button" className="ghost" onClick={() => {
          props.onChange({ ...value, timeRanges: [{ ...proposal.routine }] });
          setConfirmed(true); setMode("manual");
        }}>Yes</button>
        <button type="button" className="ghost" onClick={() => setMode("manual")}>No</button>
      </div>
    </> : <p className="muted">Loading the pattern…</p>}
    <button type="button" className="ghost" onClick={() => setMode("manual")}>Enter the routine manually</button>
  </div>;
}
