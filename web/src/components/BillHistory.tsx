import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type BakitGanito, type BillChecksResult, type HistoryBill, type Household } from "../api/client";
import { maskSin, monthLabel, peso } from "../lib/format";
import { BillChecks } from "./BillChecks";

/** Parent keys this component by session and SIN so old data disappears immediately. */
export function BillHistory({ token, household, onExpired, renderExplanation }: {
  token: string; household: Household; onExpired: () => void; renderExplanation: (r: BakitGanito) => ReactNode;
}) {
  const [bills, setBills] = useState<HistoryBill[] | null>(null);
  const [explanation, setExplanation] = useState<BakitGanito | null>(null);
  const [checks, setChecks] = useState<BillChecksResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBills(null); setExplanation(null); setChecks(null); setError(null); setExplanationError(null);
    async function load() {
      try {
        const history = await api.history(token, household.sin, controller.signal);
        if (!active) return;
        setBills(history);
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
  return <>
    <section className="card history" aria-busy={!bills && !error}>
      <h2>Bill History · {maskSin(household.sin)}</h2>
      <p className="muted">{household.masked_address} · {household.meter_type === "smart" ? "Smart meter" : "Traditional meter"}</p>
      {!bills && !error && <p role="status">Loading Bill History…</p>}
      {error && <><p className="error" role="alert">{error}</p><button className="ghost" onClick={() => setAttempt((n) => n + 1)}>Try again</button></>}
      {bills && !bills.length && <p>No Bill History for this Household yet.</p>}
      {bills && bills.length > 0 && <>
        {bills.some((b) => b.provenance?.kind === "generated" || b.provenance?.kind === "sample") &&
          <p className="notice warn">Demo data: includes synthetic Bills. This is not real Bill History from Meralco.</p>}
        <div className="table-scroll"><table>
          <caption>{bills.length} Bills · oldest to newest</caption>
          <thead><tr><th scope="col">Month</th><th scope="col">kWh</th><th scope="col">Days</th><th scope="col">Charges</th></tr></thead>
          <tbody>{bills.map((b) => <tr key={b.period}>
            <th scope="row">{monthLabel(b.period)}<small>{b.provenance?.kind === "sample" ? "Sample" : b.provenance?.kind === "generated" ? "Generated" : b.provenance?.kind === "real-derived" ? "From a Bill" : "Not specified"}</small></th>
            <td>{b.kwh.toLocaleString("en-PH")}</td><td>{b.billingDays}</td>
            <td>{b.chargeLines?.length ? peso(b.chargeLines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0)) : "—"}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
      {explanationError && <p className="error" role="alert">{explanationError}</p>}
    </section>
    {explanation && <div id="bakit-ganito" className="anchor">{renderExplanation(explanation)}</div>}
    {checks && <div id="tama-ba" className="anchor"><BillChecks data={checks} /></div>}
  </>;
}
