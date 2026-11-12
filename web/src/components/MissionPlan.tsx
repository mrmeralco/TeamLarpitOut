import { useEffect, useState } from "react";
import { ApiError, missionPlanApi, type Household, type MissionPlan as Plan, type PlanMission } from "../api/client";
import { greeting, month, wholePeso } from "./HomeWrapped";

const pesoAmount = (centavos: number) => wholePeso(centavos, false);

/** The last plan per session and Household: the Missions tab and Home's plan card show it at once while a fresh copy loads. */
const planCache = new Map<string, Plan>();
const planKey = (token: string, sin: string) => `${token}:${sin}`;
/** Forgets every cached plan, e.g. when the session ends. */
export const clearPlanCache = () => planCache.clear();

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
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
};

/** One icon per appliance a Mission is about. */
const APPLIANCE_ICON: Record<string, string> = {
  aircon: "M3 5h18v8H3zM7 17l-1 3M12 17v3M17 17l1 3M7 9h10",
  electric_fan: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 10c0-4 2-7 5-6s1 5-3 6M14 12c4 0 7 2 6 5s-5 1-6-3M10 12c-4 0-7-2-6-5s5-1 6 3M12 14v7",
  tv: "M3 6h18v11H3zM8 21h8M12 17v4",
  lights: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  refrigerator: "M6 2h12v20H6zM6 10h12M9 5v2M9 13v3",
  flat_iron: "M3 17h18l-2-7a4 4 0 0 0-4-3H9M3 17l2-4h8M7 20h10",
  washing_machine: "M5 3h14v18H5zM5 8h14M12 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  computer: "M3 4h18v12H3zM8 20h8M12 16v4",
  rice_cooker: "M4 10h16v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM6 10a6 4 0 0 1 12 0M12 4v2",
  wifi: "M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01",
  other: "M12 5v14M5 12h14",
};
const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/**
 * Missions tab, laid out like Home: a compact Eelio card with Shuffle and a gamified goal meter on
 * top (each Mission's share of the 5% goal up to the finish flag, and the plan's points), then the
 * Missions as quest cards, each with the points it is worth.
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
  const [plan, setPlanState] = useState<Plan | null>(() => planCache.get(planKey(token, household.sin)) ?? null);
  const setPlan = (next: Plan | null | ((p: Plan | null) => Plan | null)) => setPlanState((prev) => {
    const value = typeof next === "function" ? next(prev) : next;
    if (value) planCache.set(planKey(token, household.sin), value);
    return value;
  });
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
      // A failed background refresh keeps the cached plan on screen.
      if (!controller.signal.aborted && !planCache.has(planKey(token, household.sin))) fail(err, "Couldn't get the Missions.");
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

  const daily = plan.daily;
  // Smart meter homes see today's Missions (they change daily); others see the month's plan.
  const shownMissions = daily?.missions ?? plan.missions;
  const open = missionId ? shownMissions.find((m) => m.id === missionId) : undefined;
  async function remind(id: string) {
    setError(null);
    try {
      const out = await missionPlanApi.remind(token, household.sin, id);
      setPlan((p) => (p ? { ...p, reminders: out.reminders } : p));
    } catch (err) { fail(err, "Couldn't set the reminder right now."); }
  }

  if (open) return <MissionDetail plan={daily ? { ...plan, missions: daily.missions } : plan} mission={open} daily={Boolean(daily)} busy={busy} error={error} onBack={onBack} onSwap={() => void swap(open.id)} onRemind={() => void remind(open.id)} />;

  const areaLabel = household.masked_address || "Your home";
  const totalPoints = plan.rewardPoints ?? plan.missions.reduce((s, m) => s + (m.rewardPoints ?? 0), 0);
  // The goal meter follows what's shown: today's Missions against today's goal for smart meter homes.
  const shareOf = (m: PlanMission) => (daily ? (daily.goal.pesos > 0 ? (m.pesoValue / daily.goal.pesos) * 100 : 0) : (m.percent / plan.goal.cut) * 100);
  const meterMissions = daily ? daily.missions : plan.missions;
  const fill = meterMissions.reduce((s, m) => s + shareOf(m), 0);
  const scale = Math.max(100, fill);
  const pct = daily ? Math.min(100, Math.round(fill)) : Math.min(100, Math.round(plan.covered * 100));
  const isGoalReached = daily ? fill >= 100 : plan.covered >= 1;
  const coveredPercent = daily ? (fill / 100) * plan.goal.cut : plan.coveredPercent;
  const legendPercent = (m: PlanMission) => (daily ? (shareOf(m) / 100) * plan.goal.cut : m.percent);
  const mood: Mood = isGoalReached ? "charged" : "detective";

  return (
    <section className="dash mission-dash" aria-labelledby="mission-plan-title">
      <div className="dash-main">
        <div className={`hero mood-${mood}`}>
          <div className="hero-copy">
            <p className="hero-hello">{greeting()} · {areaLabel}</p>
            <h2 id="mission-plan-title">{daily ? `Today: use ${plan.goal.cut}% less` : `Use ${plan.goal.cut}% less electricity`}</h2>
            {daily ? (
              <p className="hero-amount">
                ~{pesoAmount(daily.goal.pesos)}
                <span className="hero-change down">About {daily.goal.kwh.toFixed(1)} kWh today · new missions every day</span>
              </p>
            ) : (
              <p className="hero-amount">
                ~{pesoAmount(plan.goal.pesos)}
                <span className="hero-change down">About {Math.round(plan.goal.kwh)} kWh, or ~{pesoAmount(plan.goal.pesos)} off your bill</span>
              </p>
            )}
            {!daily && (
              <button type="button" className="hero-play" disabled={busy} onClick={() => void shuffle()}>
                <Svg d={ICON.shuffle} /> Shuffle
              </button>
            )}
          </div>
          <img className="hero-mascot" src={MOOD[mood].img} alt={`Eelio, ${MOOD[mood].title}`} />
        </div>
      </div>

      <aside className="dash-side" aria-label="Goal coverage">
        <div className={`card goal-meter${isGoalReached ? " reached" : ""}`}>
          <div className="goal-head">
            <div>
              <h3>{daily ? "Today's goal" : "Goal coverage"}</h3>
              <span className="muted small">{daily
                ? `${new Date(`${daily.date}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" })} · ${daily.goal.kwh.toFixed(1)} kWh to save`
                : `${month(plan.period)} plan · ${Math.round(plan.goal.kwh)} kWh to save`}</span>
            </div>
            <span className="goal-reward" title={daily ? "Points if you finish today's missions" : "Points if you finish every mission"}><span className="coin" aria-hidden="true">★</span>+{daily ? daily.rewardPoints : totalPoints} pts</span>
          </div>
          {daily && (
            <div className="daily-score">
              <span className={`daily-streak${daily.streak > 0 ? " on" : ""}`}><span aria-hidden="true">🔥</span> {daily.streak}-day streak</span>
              <span className="daily-yesterday">{daily.yesterday
                ? daily.yesterday.hasOutage
                  ? "Yesterday: brownout · 0 pts"
                  : `Yesterday: +${daily.yesterday.points} pts · ${daily.yesterday.savedKwh.toFixed(1)} kWh saved`
                : "Yesterday's result shows after your first full day"}</span>
            </div>
          )}
          {plan.climate && (
            <div className={`climate-chip ${plan.climate.phase}`} title={plan.climate.source}>
              <span aria-hidden="true">{plan.climate.phase === "elNino" ? "🔥" : plan.climate.phase === "laNina" ? "🌧" : "🌤"}</span>
              <span><span className="climate-kicker">This month's climate (PAGASA)</span> <strong>{plan.climate.label}</strong> · points ×{plan.climate.multiplier}</span>
              {plan.outage ? (
                <span className="climate-brownout recorded">
                  <span aria-hidden="true">⚡</span> Brownout on Meralco's record{plan.outage.date ? ` · ${new Date(`${plan.outage.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` : ""}
                  {plan.outage.durationHours ? ` · ${plan.outage.durationHours} h` : ""} · {household.meter_type === "smart" ? "no points that day" : "no points this month"}
                </span>
              ) : (
                <span className="climate-brownout"><span aria-hidden="true">⚡</span> {household.meter_type === "smart" ? "Brownout day = 0 pts" : "Brownout month = 0 pts"}</span>
              )}
            </div>
          )}
          <div className="goal-track-wrap">
            <div className="goal-track" role="progressbar" aria-label="How much of the goal the plan covers" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              {meterMissions.map((m, i) => (
                <span key={m.id} className={`goal-seg tone-${i % 5}`} style={{ width: `${(shareOf(m) / scale) * 100}%`, animationDelay: `${i * 120}ms` }} title={`${m.title}: ${legendPercent(m).toFixed(1)}%`} />
              ))}
            </div>
            <span className="goal-flag" style={{ left: `${(100 / scale) * 100}%` }} aria-hidden="true"><span>🏁</span><b>{plan.goal.cut}%</b></span>
          </div>
          <p className="goal-status">
            {isGoalReached && <span className="goal-trophy" aria-hidden="true">🏆</span>}
            {daily ? "Today's missions cover" : "Your plan covers"} {Math.min(coveredPercent, 99.9).toFixed(1)}%{isGoalReached ? " · Goal reached" : ` of ${plan.goal.cut}%`}
          </p>
          <ul className="goal-legend">
            {meterMissions.map((m, i) => (
              <li key={m.id}>
                <span className={`goal-dot tone-${i % 5}`} aria-hidden="true" />
                <span className="goal-legend-name">{m.title}</span>
                <strong>{legendPercent(m).toFixed(1)}%</strong>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="dash-wide">
        <div className="card quests-card">
          <div className="quests-card-head">
            <div>
              <h3>{daily ? "Today's missions" : "Your missions"}</h3>
              <span className="muted small">{daily
                ? `${shownMissions.length} missions for today · new ones at midnight · tap one to see how`
                : `${plan.missions.length} missions picked for your home · tap one to see how`}</span>
            </div>
          </div>
          {note && <p className="muted small" role="status">{note}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <ul className="mission-quests">
            {shownMissions.map((m, i) => (
              <li key={m.id} style={{ animationDelay: `${i * 60}ms` }}>
                <button type="button" className="mission-quest" onClick={() => onOpen(m.id)}>
                  <span className={`mission-quest-icon tone-${i % 5}`} aria-hidden="true"><Svg d={APPLIANCE_ICON[m.appliance] ?? ICON.bolt} /></span>
                  <span className="mission-quest-body">
                    <span className="mission-quest-n">Mission {i + 1} · <span className={`mission-effort ${m.effort.toLowerCase()}`}>{m.effort === "Easy" ? "⚡" : "⚡⚡"} {m.effort}</span></span>
                    <strong className="mission-quest-title">{m.title}</strong>
                    <span className="mission-quest-why">{m.why}</span>
                  </span>
                  <span className="mission-quest-side">
                    <span className="mission-quest-pts"><span className="coin" aria-hidden="true">★</span>+{m.rewardPoints ?? Math.max(1, Math.round(m.pesoValue / 100))} pts</span>
                    <span className="mission-quest-save">{daily ? `~${pesoAmount(m.pesoValue)} today` : `−${m.percent.toFixed(1)}% · ~${pesoAmount(m.pesoValue)}`}</span>
                  </span>
                  <span className="mission-quest-arrow" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small quests-note">
            {plan.source === "ai" ? "AI picks and words the missions for your appliances and routine." : "Missions picked for your appliances and routine."}{" "}
            Every peso value is computed from your bill.{" "}
            {household.meter_type === "smart"
              ? "Points follow what your smart meter reads each day: 1 point per ₱2 saved, after the normal 1% change."
              : "Points follow your next bill: 1 point per ₱2 saved, after the normal 1% month-to-month change."}
          </p>
        </div>
      </div>
    </section>
  );
}

function MissionDetail({ plan, mission, daily = false, busy, error, onBack, onSwap, onRemind }: {
  plan: Plan; mission: PlanMission; daily?: boolean; busy: boolean; error: string | null; onBack: () => void; onSwap: () => void; onRemind: () => void;
}) {
  const index = plan.missions.indexOf(mission);
  // Saved on the server, so the reminder shows on every device.
  const reminded = plan.reminders?.includes(mission.id) ?? false;

  return (
    <section className="flow mission-detail" aria-labelledby="mission-detail-title">
      <div className="card-head">
        <button type="button" className="back" aria-label="Back to plan" onClick={onBack}>‹</button>
        <span className="muted small">Mission {index + 1} of {plan.missions.length} {daily ? "for today" : "in your plan"}</span>
      </div>

      <h2 id="mission-detail-title">{mission.title}</h2>

      <dl className="sheet-facts">
        <div>
          <dt>Of your {plan.goal.cut}% goal</dt>
          <dd>{mission.percent.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>{daily ? "Could save today" : "Could save"}</dt>
          <dd>~{pesoAmount(mission.pesoValue)}</dd>
        </div>
        <div>
          <dt>Effort</dt>
          <dd>{mission.effort}</dd>
        </div>
        <div>
          <dt>Worth</dt>
          <dd>+{mission.rewardPoints ?? Math.max(1, Math.round(mission.pesoValue / 100))} pts</dd>
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
      <button type="button" className="primary" disabled={reminded} onClick={onRemind}>{reminded ? "Reminder set ✓" : "Remind me tonight"}</button>
      {!daily && <button type="button" className="ghost wide" disabled={busy} onClick={onSwap}>Swap for a different mission</button>}
    </section>
  );
}

/** Home's card once setup is done: the Mission Plan in one line. */
export function PlanSummaryCard({ token, sin, onOpen }: { token: string; sin: string; onOpen: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(() => planCache.get(planKey(token, sin)) ?? null);
  useEffect(() => {
    const controller = new AbortController();
    missionPlanApi.get(token, sin, controller.signal).then((p) => { planCache.set(planKey(token, sin), p); setPlan(p); }).catch(() => {});
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
