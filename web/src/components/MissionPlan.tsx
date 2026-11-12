import { useEffect, useState } from "react";
import { ApiError, missionPlanApi, type Household, type MissionPlan as Plan, type PlanMission } from "../api/client";
import { greeting, month, wholePeso } from "./HomeWrapped";

const reminderKey = (sin: string, id: string) => `kuryenteko.reminder.${sin}.${id}`;
const pesoAmount = (centavos: number) => wholePeso(centavos, false);

/** Eelio's three gamified states, identical to Home module (docs/mascot/mascot-branding-eelio.md). */
type Mood = "charged" | "detective" | "sleepy";
const MOOD: Record<Mood, { img: string; title: string; line: string }> = {
  charged: { img: "/mascot/eelio-hero.png", title: "Fully Charged", line: "Your missions cover the 5% goal. Eelio is buzzing!" },
  detective: { img: "/mascot/eelio-detective.png", title: "Bill Detective", line: "Eelio read your appliances and routine. Complete these missions to save." },
  sleepy: { img: "/mascot/eelio-sleepy.png", title: "Low Battery", line: "Eelio is running low. Tap into your missions to charge Eelio up." },
};

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="stars" role="img" aria-label={`${label}: ${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= value ? "on" : ""} aria-hidden="true">★</span>)}
    </span>
  );
}

const ICON = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  play: "M8 5v14l11-7z",
};
const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const SWATCH_GROUPS = ["meralco", "passthrough", "government", "subsidy", "other"];

/**
 * Missions tab, mirroring the gamified design of the Home module:
 * A hero card with Eelio's mood and charge, three energy skills, a charges-style breakdown
 * with split-bar and interactive charge-rows, and an appliances-style goal coverage card.
 */
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
    missionPlanApi.get(token, household.sin, controller.signal).then(setPlan).catch((err) => {
      if (!controller.signal.aborted) fail(err, "Couldn't get the Missions.");
    });
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
  if (!plan) return <section className="dash loading" aria-busy="true"><p className="muted">Eelio is picking your missions…</p></section>;

  const open = missionId ? plan.missions.find((m) => m.id === missionId) : undefined;
  if (open) return <MissionDetail plan={plan} mission={open} sin={household.sin} busy={busy} error={error} onBack={onBack} onSwap={() => void swap(open.id)} />;

  const pct = Math.min(100, Math.round(plan.covered * 100));
  const isGoalReached = plan.covered >= 1;
  const mood: Mood = isGoalReached ? "charged" : "detective";
  const areaLabel = household.masked_address || "Your home";

  return (
    <section className="dash" aria-labelledby="mission-plan-title">
      <div className="dash-main">
        {/* Gamified Hero Card with Eelio (identical to Home module's hero) */}
        <div className={`hero mood-${mood}`}>
          <div className="hero-copy">
            <p className="hero-hello">{greeting()} · {areaLabel}</p>
            <h2 id="mission-plan-title">Use {plan.goal.cut}% less electricity</h2>
            <p className="hero-amount">
              ~{pesoAmount(plan.goal.pesos)}
              <span className="hero-change down">
                About {Math.round(plan.goal.kwh)} kWh, or ~{pesoAmount(plan.goal.pesos)} off your bill
              </span>
            </p>
            <div className="hero-title">
              <span className="hero-title-icon"><Svg d={ICON.bolt} /></span>
              <span><span className="small">Eelio says you're</span><strong>{MOOD[mood].title}</strong></span>
            </div>
            <div className="charge-meter" role="meter" aria-label="Eelio's charge" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span className="charge-track"><span style={{ width: `${pct}%` }} /></span>
              <span className="small">{pct}% charged</span>
            </div>
            <div className="plan-bar" role="progressbar" aria-label="How much of the goal the plan covers" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="hero-line">Your plan covers {Math.min(plan.coveredPercent, 99.9).toFixed(1)}%{plan.covered >= 1 ? " · Goal reached" : ` of ${plan.goal.cut}%`}</p>
            <button type="button" className="hero-play" disabled={busy} onClick={() => void shuffle()}>
              <Svg d={ICON.play} /> Shuffle
            </button>
          </div>
          <img className="hero-mascot" src={MOOD[mood].img} alt={`Eelio, ${MOOD[mood].title}`} />
        </div>

        {/* Missions Breakdown Card (mirroring Home module's ChargesBreakdown) */}
        <div className="card charges-card">
          <div className="charges-head">
            <h3>Your plan, picked for your home</h3>
            <span className="muted small">Tap a mission to see how to do it</span>
          </div>
          {note && <p className="muted small" role="status" style={{ margin: "4px 0 8px" }}>{note}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="split-bar" role="img" aria-label={plan.missions.map((m) => `${m.title} ${m.percent.toFixed(1)}%`).join(", ")}>
            {plan.missions.map((m, i) => (
              <span key={m.id} className={`seg g-${SWATCH_GROUPS[i % SWATCH_GROUPS.length]}`} style={{ width: `${(m.percent / plan.goal.cut) * 100}%` }} />
            ))}
          </div>
          <ul className="split-legend">
            {plan.missions.map((m, i) => (
              <li key={m.id} title={m.why}>
                <span className={`swatch g-${SWATCH_GROUPS[i % SWATCH_GROUPS.length]}`} aria-hidden="true" />
                <span>{m.title}</span>
                <strong>~{pesoAmount(m.pesoValue)}</strong>
                <span className="muted">{m.percent.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <ul className="charge-list plan-list">
            {plan.missions.map((m, i) => (
              <li key={m.id}>
                <button type="button" className="charge-row plan-item" onClick={() => onOpen(m.id)}>
                  <span className={`swatch g-${SWATCH_GROUPS[i % SWATCH_GROUPS.length]}`} aria-hidden="true" />
                  <span className="charge-row-name">
                    <strong>{m.title}</strong>
                    <span>{m.why}</span>
                  </span>
                  <span className="charge-row-amount">
                    <strong>~{pesoAmount(m.pesoValue)}</strong>
                    <span className="down">−{m.percent.toFixed(1)}% · ~{pesoAmount(m.pesoValue)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ margin: "14px 0 0" }}>
            {plan.source === "ai" ? "AI picks and words the missions for your appliances and routine." : "Missions picked for your appliances and routine."}{" "}
            Every peso value is computed from your bill.{" "}
            {household.meter_type === "smart"
              ? "Points come only from savings your smart meter verifies each day."
              : "Points come only from savings verified on your next bill."}
          </p>
        </div>
      </div>

      {/* Side Column (mirroring Home module's dash-side with save-card & appliances-bars) */}
      <aside className="dash-side" aria-label="Missions breakdown">
        <div className="save-card" style={{ cursor: "default" }}>
          <span>
            <strong>Verified Savings · 1 pt per ₱1 saved</strong>
            <span>Save about ~{pesoAmount(plan.goal.pesos)} on next month's bill and unlock points automatically.</span>
          </span>
          <span aria-hidden="true">→</span>
        </div>

        <div className="card appliances-card">
          <div className="usage-head">
            <h3>Goal coverage by mission</h3>
            <span className="muted small">{month(plan.period)} plan · {Math.round(plan.goal.kwh)} kWh</span>
          </div>
          <ul className="appliance-bars">
            {plan.missions.map((m) => (
              <li key={m.id}>
                <span className="appliance-name">
                  <strong>{m.title}</strong>
                  <span>Effort: {m.effort}</span>
                </span>
                <span className="appliance-track" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (m.percent / plan.goal.cut) * 100)}%` }} />
                </span>
                <span className="appliance-amount">
                  <strong>{m.percent.toFixed(1)}%</strong>
                  <span>~{pesoAmount(m.pesoValue)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Estimates from your appliances and routine; each mission covers a share of your 5% goal.</p>
        </div>
      </aside>
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
      <div className="card-head">
        <button type="button" className="back" aria-label="Back to plan" onClick={onBack}>‹</button>
        <span className="muted small">Mission {index + 1} of {plan.missions.length} in your plan</span>
      </div>

      <h2 id="mission-detail-title">{mission.title}</h2>

      <dl className="sheet-facts">
        <div>
          <dt>Of your {plan.goal.cut}% goal</dt>
          <dd>{mission.percent.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Could save</dt>
          <dd>~{pesoAmount(mission.pesoValue)}</dd>
        </div>
        <div>
          <dt>Effort</dt>
          <dd>{mission.effort}</dd>
        </div>
      </dl>

      <h3>Why this is in your plan</h3>
      <p>{mission.why}</p>

      {mission.how.length > 0 && (
        <>
          <h3>How to do it</h3>
          <ol className="steps">
            {mission.how.map((h, i) => (
              <li key={i}>
                <span className="step-n">{i + 1}</span>
                <p>{h}</p>
              </li>
            ))}
          </ol>
        </>
      )}

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
          ? `${plan.missions.length} mission${plan.missions.length === 1 ? "" : "s"} · about ${Math.round(plan.goal.kwh)} kWh, or ~${pesoAmount(plan.goal.pesos)}`
          : "Your missions are ready."}</span>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
