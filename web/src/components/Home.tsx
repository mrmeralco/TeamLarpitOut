import { useEffect, useState, type ReactNode } from "react";
import {
  ApiError, homeApi, missionPlanApi,
  type HomeChargeLine, type Household, type HomeSummary, type MissionPlan, type SetupStatus, type UsageMonth,
} from "../api/client";
import { greeting, HomeWrapped, month, plainPeso, wholePeso } from "./HomeWrapped";

/** Eelio's three gamified states (docs/mascot/mascot-branding-eelio.md). */
type Mood = "charged" | "detective" | "sleepy";
const MOOD: Record<Mood, { img: string; title: string; line: string }> = {
  charged: { img: "/mascot/eelio-hero.png", title: "Fully Charged", line: "You used less power than last month. Eelio is buzzing!" },
  detective: { img: "/mascot/eelio-detective.png", title: "Bill Detective", line: "Eelio read your bill. Tap play to see what happened." },
  sleepy: { img: "/mascot/eelio-sleepy.png", title: "Low Battery", line: "Eelio is running low. Set up your home to charge Eelio up." },
};

function moodFor(data: HomeSummary, setup: SetupStatus | null): Mood {
  const habit = data.bakitGanito?.habit ?? 0;
  if (habit < 0) return "charged";
  if (setup && !setup.complete) return "sleepy";
  return "detective";
}

/** Eelio's charge (0–100): each setup step, an active plan, and lower usage than last month. */
function chargeFor(data: HomeSummary, setup: SetupStatus | null, plan: MissionPlan | null): number {
  const steps = setup ? setup.doneCount * 20 : 0;
  return Math.min(100, steps + (plan ? 20 : 0) + ((data.bakitGanito?.habit ?? 0) < 0 ? 20 : 0));
}

/** 1–5 stars from how much an effect moved the bill, as a share of last month's bill. */
function starsFrom(amount: number | undefined, base: number): number {
  if (amount === undefined) return 3;
  const share = amount / Math.max(1, base);
  return share <= -0.05 ? 5 : share < 0 ? 4 : share <= 0.03 ? 3 : share <= 0.1 ? 2 : 1;
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="stars" role="img" aria-label={`${label}: ${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= value ? "on" : ""} aria-hidden="true">★</span>)}
    </span>
  );
}

function Ring({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span className="ring" role="img" aria-label={`${label}: ${p}%`} style={{ "--p": `${p}` } as React.CSSProperties}>
      <span aria-hidden="true">{p}%</span>
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
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** kWh per month as a small line chart; the latest month is marked. */
function UsageChart({ months }: { months: UsageMonth[] }) {
  const data = months.slice(-12);
  if (data.length < 2) return <p className="muted small">Your usage chart appears once there are two bills.</p>;
  const W = 520, H = 170, P = 24;
  const max = Math.max(...data.map((m) => m.kwh)) * 1.15 || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (data.length - 1);
  const y = (kwh: number) => H - P - (kwh / max) * (H - 2 * P);
  const line = data.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m.kwh).toFixed(1)}`).join(" ");
  const last = data.at(-1)!;
  const sampled = data.some((m) => m.provenance?.kind && !["scanned", "real-derived"].includes(m.provenance.kind));
  return (
    <figure className="usage-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`kWh per month, ${month(data[0]!.period)} to ${month(last.period)}. Latest ${last.kwh} kWh.`}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={P} x2={W - P} y1={H - P - f * (H - 2 * P)} y2={H - P - f * (H - 2 * P)} className="grid" />)}
        <path d={`${line} L${x(data.length - 1)},${H - P} L${x(0)},${H - P} Z`} className="area" />
        <path d={line} className="line" />
        <circle cx={x(data.length - 1)} cy={y(last.kwh)} r="6" className="dot" />
        <g className="tip" transform={`translate(${Math.min(x(data.length - 1), W - 50)}, ${Math.max(y(last.kwh) - 30, 6)})`}>
          <rect x="-44" y="0" width="88" height="22" rx="8" />
          <text x="0" y="15" textAnchor="middle">{last.kwh} kWh</text>
        </g>
        {data.map((m, i) => (i % 2 === (data.length - 1) % 2) && (
          <text key={m.period} x={x(i)} y={H - 4} textAnchor="middle" className="axis">{month(m.period).slice(0, 3)}</text>
        ))}
      </svg>
      {sampled && <figcaption className="muted small">Earlier months are sample values.</figcaption>}
    </figure>
  );
}

/**
 * Home, gamified around Eelio: a hero card with the bill, Eelio's mood and charge, three star
 * skills, a usage chart, and the missions with progress rings. The bill's full story opens as
 * "Wrapped". Parent keys it by session and SIN.
 */
export function Home({ token, household, onExpired, onAskCharge, onSave, saveCard, setup, onOpenMission }: {
  token: string;
  household: Household;
  onExpired: () => void;
  /** Opens the charge chat for one line (#50). */
  onAskCharge?: (line: HomeChargeLine, summary: HomeSummary) => void;
  /** "Want to save on your next bill?" → rewards onboarding (#51). */
  onSave?: () => void;
  /** Replaces the save card once Household Setup is done (Mission Plan summary). */
  saveCard?: ReactNode;
  /** Household Setup progress, for Eelio's charge and the missions list. */
  setup?: SetupStatus | null;
  /** Opens a Mission's detail on the Missions tab. */
  onOpenMission?: (id: string) => void;
}) {
  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageMonth[] | null>(null);
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [playing, setPlaying] = useState(false);
  const planReady = !!setup?.complete;

  useEffect(() => {
    const controller = new AbortController();
    const fail = (err: unknown) => {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(err instanceof Error ? err.message : "Couldn't load Home.");
    };
    homeApi.summary(token, household.sin, controller.signal).then(setData).catch(fail);
    homeApi.usage(token, household.sin, controller.signal).then(setUsage).catch(() => { if (!controller.signal.aborted) setUsage([]); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, household.sin]);

  useEffect(() => {
    if (!planReady) { setPlan(null); return; }
    const controller = new AbortController();
    missionPlanApi.get(token, household.sin, controller.signal).then(setPlan).catch(() => {});
    return () => controller.abort();
  }, [token, household.sin, planReady]);

  if (error) return <section className="card home"><p className="error" role="alert">{error}</p></section>;
  if (!data) return <section className="dash loading" aria-busy="true"><p className="muted">Eelio is reading your bill…</p></section>;

  const change = data.bakitGanito;
  const mood = moodFor(data, setup ?? null);
  const charge = chargeFor(data, setup ?? null, plan);
  const base = change ? Math.max(1, (data.bill.amountDue ?? 0) - change.total) : 1;
  const effect = (key: string) => change?.effects.find((e) => e.key === key)?.amount;
  const setupStars = setup ? Math.min(5, 1 + setup.doneCount + (plan ? 1 : 0)) : 1;

  return (
    <section className="dash" aria-label="Home">
      <div className="dash-main">
        <div className={`hero mood-${mood}`}>
          <div className="hero-copy">
            <p className="hero-hello">{greeting()} · {data.area} home</p>
            <h2>Your {month(data.bill.period)} bill</h2>
            <p className="hero-amount">{data.bill.amountDue === null ? "—" : wholePeso(data.bill.amountDue, false)}
              {change && change.total !== 0 && <span className={`hero-change ${change.total < 0 ? "down" : "up"}`}>
                {change.total < 0 ? "▼" : "▲"} {plainPeso(change.total)} vs. {month(change.previousPeriod)}
              </span>}
            </p>
            <div className="hero-title">
              <span className="hero-title-icon"><Svg d={ICON.bolt} /></span>
              <span><span className="small">Eelio says you're</span><strong>{MOOD[mood].title}</strong></span>
            </div>
            <div className="charge-meter" role="meter" aria-label="Eelio's charge" aria-valuemin={0} aria-valuemax={100} aria-valuenow={charge}>
              <span className="charge-track"><span style={{ width: `${charge}%` }} /></span>
              <span className="small">{charge}% charged</span>
            </div>
            <p className="hero-line">{MOOD[mood].line}</p>
            <button type="button" className="hero-play" onClick={() => setPlaying(true)}><Svg d={ICON.play} /> Play your bill wrapped</button>
          </div>
          <img className="hero-mascot" src={MOOD[mood].img} alt={`Eelio, ${MOOD[mood].title}`} />
        </div>

        <ul className="skills" aria-label="Your energy skills">
          <li><span className="skill-icon tone-a"><Svg d={ICON.bolt} /></span><Stars value={starsFrom(change?.habit, base)} label="Usage control" /><strong>Usage control</strong></li>
          <li><span className="skill-icon tone-b"><Svg d={ICON.sun} /></span><Stars value={starsFrom(effect("weather"), base)} label="Weather-proof" /><strong>Weather-proof</strong></li>
          <li><span className="skill-icon tone-c"><Svg d={ICON.target} /></span><Stars value={setupStars} label="Mission ready" /><strong>Mission ready</strong></li>
        </ul>

        <div className="card usage-card">
          <div className="usage-head"><h3>Your usage</h3><span className="muted small">kWh per month</span></div>
          {usage === null ? <p className="muted small">Loading…</p> : <UsageChart months={usage} />}
        </div>
      </div>

      <aside className="dash-side" aria-label="Your missions">
        <h3>Your missions</h3>
        {saveCard ?? (
          <button type="button" className="save-card" onClick={onSave}>
            <span><strong>Want to save on your next bill?</strong>
              <span>{change && change.habit > 0 ? `${plainPeso(change.habit)} came from usage. Cut it and earn points.` : "Use a little less and earn points on your next bill."}</span>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        )}
        <ul className="quests">
          {plan ? plan.missions.map((m) => (
            <li key={m.id}>
              <button type="button" className="quest" onClick={() => onOpenMission?.(m.id)}>
                <Ring percent={m.share * 100} label={`${m.title}, share of your 5% goal`} />
                <span className="quest-copy">
                  <strong>{m.title}</strong>
                  <span>−{m.percent.toFixed(1)}% · ~{wholePeso(m.pesoValue, false)}</span>
                  <span className="quest-tag">{m.effort}</span>
                </span>
              </button>
            </li>
          )) : (setup?.steps ?? []).map((s) => (
            <li key={s.key}>
              <button type="button" className="quest" onClick={onSave}>
                <Ring percent={s.done ? 100 : 0} label={s.label} />
                <span className="quest-copy">
                  <strong>{s.label}</strong>
                  <span>{s.done ? "Done" : "Setup step"}</span>
                  <span className="quest-tag">+{Math.round((setup?.welcomePoints.points ?? 100) / (setup?.total ?? 3))} pts</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {playing && (
        <div className="wrapped-overlay" role="dialog" aria-modal="true" aria-label="Your bill, wrapped">
          <HomeWrapped data={data} onAskCharge={onAskCharge} onSave={onSave} saveCard={saveCard} onClose={() => setPlaying(false)} />
        </div>
      )}
    </section>
  );
}
