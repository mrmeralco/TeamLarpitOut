import { useEffect, useState } from "react";
import { ApiError, missionPlanApi, type Household, type MissionPlan as Plan, type PlanMission } from "../api/client";

const wholePeso = (centavos: number) => `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;
const monthName = (period: string) => new Date(`${period}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long" });
const reminderKey = (sin: string, id: string) => `kuryenteko.reminder.${sin}.${id}`;

/** Missions tab once setup is done (mockup screens 12–13): the 5% goal, the plan, shuffle and the Mission detail. */
export function MissionPlan({ token, household, missionId, onOpen, onBack, onExpired }: {
  token: string;
  household: Household;
  /** The open Mission detail, from `#/missions/m/<id>`. */
  missionId?: string;
  onOpen: (id: string) => void;
  onBack: () => void;
  onExpired: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) onExpired();
    else setError(err instanceof Error ? err.message : fallback);
  };

  useEffect(() => {
    const controller = new AbortController();
    missionPlanApi.get(token, household.sin, controller.signal).then(setPlan).catch((err) => { if (!controller.signal.aborted) fail(err, "Couldn't get the Missions."); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, household.sin]);

  async function shuffle() {
    setBusy(true); setError(null); setNote(null);
    try {
      const next = await missionPlanApi.shuffle(token, household.sin);
      setPlan(next);
      if (next.changed === false) setNote("This is the only plan that fits your home right now.");
    } catch (err) { fail(err, "Couldn't shuffle right now."); } finally { setBusy(false); }
  }

  async function swap(id: string) {
    setBusy(true); setError(null);
    try {
      const next = await missionPlanApi.swap(token, household.sin, id);
      setPlan(next);
      onBack();
      const added = next.missions.find((m) => m.id === next.swapped?.in);
      if (added) setNote(`Swapped in: ${added.title}`);
    } catch (err) { fail(err, "Couldn't swap right now."); } finally { setBusy(false); }
  }

  if (error && !plan) return <section className="card"><p className="error" role="alert">{error}</p></section>;
  if (!plan) return <section className="card"><p className="muted" role="status">Loading Missions…</p></section>;

  const open = missionId ? plan.missions.find((m) => m.id === missionId) : undefined;
  if (open) return <MissionDetail plan={plan} mission={open} sin={household.sin} busy={busy} error={error} onBack={onBack} onSwap={() => void swap(open.id)} />;

  const pct = Math.min(100, Math.round(plan.covered * 100));
  return (
    <section className="mission-plan" aria-labelledby="mission-plan-title">
      <div className="plan-grid">
      <div className="plan-summary">
      <span className="muted small">{monthName(plan.period)} billing period</span>
      <div className="card goal-card">
        <span className="muted small">This month's goal</span>
        <h2 id="mission-plan-title">Use {plan.goal.cut}% less electricity</h2>
        <p>About {Math.round(plan.goal.kwh)} kWh, or ~{wholePeso(plan.goal.pesos)} off your bill</p>
        <div className="plan-bar" role="progressbar" aria-label="How much of the goal the plan covers" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="small">Your plan covers {Math.min(plan.coveredPercent, 99.9).toFixed(1)}%{plan.covered >= 1 ? " · Goal reached" : ` of ${plan.goal.cut}%`}</p>
      </div>
      </div>
      <div className="plan-body">
      <div className="section-head">
        <h3>Your plan, picked for your home</h3>
        <button type="button" className="ghost" disabled={busy} onClick={() => void shuffle()}>{busy ? "…" : "Shuffle"}</button>
      </div>
      {note && <p className="small muted" role="status">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <ol className="plan-list">
        {plan.missions.map((m) => (
          <li key={m.id}>
            <button type="button" className="plan-item" onClick={() => onOpen(m.id)}>
              <strong>{m.title}</strong>
              <span className="muted small">−{m.percent.toFixed(1)}% · ~{wholePeso(m.pesoValue)}</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="small muted">
        {plan.source === "ai" ? "AI picks and words the missions for your appliances and routine." : "Missions picked for your appliances and routine."}{" "}
        Every peso value is computed from your bill.{" "}
        {household.meter_type === "smart"
          ? "Points come only from savings your smart meter verifies each day."
          : "Points come only from savings verified on your next bill."}
      </p>
      </div>
      </div>
    </section>
  );
}

function MissionDetail({ plan, mission, sin, busy, error, onBack, onSwap }: {
  plan: Plan; mission: PlanMission; sin: string; busy: boolean; error: string | null; onBack: () => void; onSwap: () => void;
}) {
  const index = plan.missions.indexOf(mission);
  const [reminded, setReminded] = useState(() => { try { return window.localStorage.getItem(reminderKey(sin, mission.id)) === "1"; } catch { return false; } });
  const remind = () => {
    try { window.localStorage.setItem(reminderKey(sin, mission.id), "1"); } catch { /* reminder is a convenience only */ }
    setReminded(true);
  };
  return (
    <section className="flow mission-detail" aria-labelledby="mission-detail-title">
      <div className="card-head"><button type="button" className="back" aria-label="Back to plan" onClick={onBack}>‹</button><span className="muted small">Mission {index + 1} of {plan.missions.length} in your plan</span></div>
      <h2 id="mission-detail-title">{mission.title}</h2>
      <dl className="sheet-facts">
        <div><dt>Of your {plan.goal.cut}% goal</dt><dd>{mission.percent.toFixed(1)}%</dd></div>
        <div><dt>Could save</dt><dd>~{wholePeso(mission.pesoValue)}</dd></div>
        <div><dt>Effort</dt><dd>{mission.effort}</dd></div>
      </dl>
      <h3>Why this is in your plan</h3>
      <p>{mission.why}</p>
      {mission.how.length > 0 && <>
        <h3>How to do it</h3>
        <ol className="steps">{mission.how.map((h, i) => <li key={i}><span className="step-n">{i + 1}</span><p>{h}</p></li>)}</ol>
      </>}
      <h3>How you earn the points</h3>
      <p className="small">{plan.points}</p>
      {mission.assumptions.length > 0 && (
        <div className="assumptions">
          <strong className="small">Based on assumptions</strong>
          <ul>{mission.assumptions.map((a) => <li key={a.key} className="small">{a.label}: {a.value}</li>)}</ul>
        </div>
      )}
      <p className="small muted">{plan.source === "ai" ? "Suggested by AI for your home. " : ""}The kWh and peso values are estimates from your appliances, routine and bill history.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="primary" disabled={reminded} onClick={remind}>{reminded ? "Reminder set ✓" : "Remind me tonight"}</button>
      <button type="button" className="ghost wide" disabled={busy} onClick={onSwap}>Swap for a different mission</button>
    </section>
  );
}

/** Home's card once setup is done: the Mission Plan in one line. */
export function PlanSummaryCard({ token, sin, onOpen }: { token: string; sin: string; onOpen: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    missionPlanApi.get(token, sin, controller.signal).then(setPlan).catch(() => {});
    return () => controller.abort();
  }, [token, sin]);
  return (
    <button type="button" className="save-card" onClick={onOpen}>
      <span>
        <strong>Your plan: use {plan?.goal.cut ?? 5}% less electricity</strong>
        <span>{plan
          ? `${plan.missions.length} mission${plan.missions.length === 1 ? "" : "s"} · about ${Math.round(plan.goal.kwh)} kWh, or ~${wholePeso(plan.goal.pesos)}`
          : "Your missions are ready."}</span>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
