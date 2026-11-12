import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ApiError, appliancesApi, homeApi, missionPlanApi,
  type ApplianceBreakdown, type HomeChargeLine, type Household, type HomeSummary, type MissionPlan, type SetupStatus, type UsageMonth,
} from "../api/client";
import { peso } from "../lib/format";
import { EelioLoader } from "./EelioLoader";
import { greeting, HomeWrapped, month, plainPeso } from "./HomeWrapped";
import { SmartMeterUsage } from "./SmartMeterUsage";

/** Eelio's gamified states (docs/mascot/mascot-branding-eelio.md). Always active and helpful; never low battery. */
type Mood = "charged" | "detective";
const MOOD: Record<Mood, { img: string; title: string; line: string }> = {
  charged: { img: "/mascot/eelio-hero.png", title: "Fully Charged", line: "You used less power than last month. Eelio is buzzing!" },
  detective: { img: "/mascot/eelio-detective.png", title: "Bill Detective", line: "Eelio read your bill and is ready to help you save." },
};

function moodFor(data: HomeSummary, _setup: SetupStatus | null): Mood {
  const habit = data.bakitGanito?.habit ?? 0;
  if (habit < 0) return "charged";
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

const ICON = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  play: "M8 5v14l11-7z",
};
const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

const isSample = (m: UsageMonth) => !!m.provenance?.kind && !["scanned", "real-derived"].includes(m.provenance.kind);

/** kWh of the last 12 Bills as bars; the latest Bill is highlighted, the average is a dashed line. */
function UsageBars({ months }: { months: UsageMonth[] }) {
  const data = months.slice(-12);
  if (data.length < 2) return <p className="muted small">Your usage chart appears once there are two bills.</p>;
  const max = Math.max(...data.map((m) => m.kwh)) || 1;
  const avg = data.reduce((s, m) => s + m.kwh, 0) / data.length;
  const last = data.at(-1)!;
  return (
    <figure className="usage-bars">
      <div className="bars" role="img" aria-label={`kWh per bill, ${month(data[0]!.period)} to ${month(last.period)}. Latest ${last.kwh} kWh; ${data.length}-month average ${Math.round(avg)} kWh.`}>
        <span className="bars-avg" style={{ bottom: `calc(22px + (100% - 44px) * ${avg / max})` }} aria-hidden="true"><span>avg {Math.round(avg)}</span></span>
        {data.map((m, i) => {
          const latest = i === data.length - 1;
          return (
            <span key={m.period} className={`bar-col${latest ? " latest" : ""}${isSample(m) ? " sample" : ""}`} aria-hidden="true">
              <span className="ubar" style={{ height: `${Math.max(4, (m.kwh / max) * 100)}%`, animationDelay: `${i * 40}ms` }}>
                {latest && <span className="ubar-value">{m.kwh} kWh</span>}
              </span>
              <span className="bar-month">{month(m.period).slice(0, 3)}</span>
            </span>
          );
        })}
      </div>
      {data.some(isSample) && <figcaption className="muted small"><span className="swatch sample" aria-hidden="true" /> Earlier months are sample values.</figcaption>}
    </figure>
  );
}

const GROUPS: { key: string; label: string; note: string; icon: string }[] = [
  { key: "Pass-through", label: "Pass-through", note: "Goes to power generators and the grid", icon: "M13 2 4 14h7l-1 8 9-12h-7z" },
  { key: "Meralco", label: "Meralco", note: "Meralco's own distribution charges", icon: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5" },
  { key: "Government", label: "Government", note: "Taxes and government charges", icon: "M3 21h18M4 10h16M12 3l9 5H3zM6 10v8M10 10v8M14 10v8M18 10v8" },
  { key: "Subsidy", label: "Subsidies", note: "Discounts for other customers, set by law", icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
  { key: "Other", label: "Other", note: "Other charges on the bill", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

/** Every charge on the Bill, grouped by who gets the money; each line opens the charge chat. */
/** On phones the charge tiles come in swipeable groups of this many (2 × 2). */
const PAGE_SIZE = 4;

function ChargesBreakdown({ data, onAsk }: { data: HomeSummary; onAsk?: (line: HomeChargeLine) => void }) {
  const pager = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const all = [...data.chargeLines.all].sort((a, b) => b.amount - a.amount);
  if (all.length === 0) return null;
  const lines = all.filter((l) => l.amount !== 0);
  const zero = all.length - lines.length;
  const total = lines.reduce((s, l) => s + Math.max(0, l.amount), 0) || 1;
  const groupOf = (l: HomeChargeLine) => (GROUPS.some((g) => g.key === l.goesTo) ? l.goesTo! : "Other");
  const toneOf = (key: string) => key.toLowerCase().replace(/\W/g, "");
  const groups = GROUPS.map((g) => ({ ...g, amount: lines.filter((l) => groupOf(l) === g.key).reduce((s, l) => s + Math.max(0, l.amount), 0) }))
    .filter((g) => g.amount > 0);
  const pages = Array.from({ length: Math.ceil(lines.length / PAGE_SIZE) }, (_, p) => lines.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE));
  const tile = (l: HomeChargeLine, i: number) => {
    const g = GROUPS.find((x) => x.key === groupOf(l))!;
    const tone = toneOf(g.key);
    const share = (Math.max(0, l.amount) / total) * 100;
    return (
      <li key={l.id} style={{ animationDelay: `${i * 30}ms` }}>
        <button type="button" className={`charge-tile t-${tone}${i === 0 ? " biggest" : ""}`} onClick={() => onAsk?.(l)}
          aria-label={`${l.label}: ${peso(l.amount)}${l.change !== null ? `, ${peso(l.change, true)} vs. last month` : ""}${l.goesTo ? `, ${l.goesTo}` : ""}.${i === 0 ? " Biggest charge." : ""} Ask about this charge`}>
          <span className="charge-tile-top">
            <span className={`charge-tile-icon g-${tone}`} aria-hidden="true"><Svg d={g.icon} />{i === 0 && <span className="charge-tile-crown" title="Biggest charge">★</span>}</span>
            {l.change !== null && l.change !== 0 && <span className={`charge-tile-change ${l.change > 0 ? "up" : "down"}`}>{l.change > 0 ? "▲" : "▼"} {peso(Math.abs(l.change))}</span>}
          </span>
          <strong className="charge-tile-amount">{peso(l.amount)}</strong>
          <strong className="charge-tile-name">{l.label}</strong>
          <span className="charge-tile-meter" aria-hidden="true"><span className={`g-${tone}`} style={{ width: `${Math.max(3, share)}%` }} /></span>
          <span className="charge-tile-meta">{Math.round(share)}% of the bill</span>
        </button>
      </li>
    );
  };
  return (
    <section className="card charges-card home-charges" aria-label="Your bill's charges">
      <div className="charges-head">
        <div>
          <h3>Charges on your bill</h3>
          <span className="muted small">Tap a charge to ask Eelio what it is</span>
        </div>
        <strong className="charges-total">{peso(total)}</strong>
      </div>
      <div className="split-bar" role="img" aria-label={groups.map((g) => `${g.label} ${Math.round((g.amount / total) * 100)}%`).join(", ")}>
        {groups.map((g) => <span key={g.key} className={`seg g-${toneOf(g.key)}`} style={{ width: `${(g.amount / total) * 100}%` }} />)}
      </div>
      <ul className="split-legend">
        {groups.map((g) => (
          <li key={g.key} title={g.note}>
            <span className={`swatch g-${toneOf(g.key)}`} aria-hidden="true" />
            <span>{g.label}</span>
            <strong>{peso(g.amount)}</strong>
            <span className="muted">{Math.round((g.amount / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <div className="charge-pages" ref={pager} onScroll={(e) => {
        const el = e.currentTarget;
        if (el.clientWidth) setPage(Math.round(el.scrollLeft / el.clientWidth));
      }}>
        {pages.map((group, p) => (
          <ul key={p} className="charge-cards charge-page" role="list" aria-label={pages.length > 1 ? `Charges ${p * PAGE_SIZE + 1} to ${p * PAGE_SIZE + group.length}` : undefined}>
            {group.map((l, j) => tile(l, p * PAGE_SIZE + j))}
          </ul>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="charge-pager" aria-label="Charge groups">
          {pages.map((_, p) => (
            <button key={p} type="button" className={p === page ? "on" : ""} aria-label={`Show charges group ${p + 1} of ${pages.length}`} aria-current={p === page ? "true" : undefined}
              onClick={() => { const el = pager.current; el?.scrollTo?.({ left: p * el.clientWidth, behavior: "smooth" }); setPage(p); }} />
          ))}
          <span aria-hidden="true">{page + 1}/{pages.length}{page < pages.length - 1 ? " · swipe for more" : ""}</span>
        </div>
      )}
      {zero > 0 && <p className="muted small charges-zero">+{zero} more {zero === 1 ? "charge" : "charges"} at ₱0 on this bill.</p>}
    </section>
  );
}

/** Where the Bill's kWh went, by appliance; shown only after the appliances are set up. */
function AppliancesCard({ data, onEdit }: { data: ApplianceBreakdown; onEdit?: () => void }) {
  const rows = [...data.rows].sort((a, b) => b.kwh - a.kwh);
  const top = rows[0]?.share || 1;
  return (
    <div className="card appliances-card">
      <div className="usage-head">
        <h3>Your appliances</h3>
        <span className="usage-head-side">
          <span className="muted small">{month(data.bill.period)} bill · {Math.round(data.bill.kwh)} kWh</span>
          {onEdit && <button type="button" className="edit-link" onClick={onEdit}>Edit</button>}
        </span>
      </div>
      <ul className="appliance-bars">
        {rows.map((r) => (
          <li key={r.index}>
            <span className="appliance-name"><strong>{r.label}{r.quantity > 1 ? ` ×${r.quantity}` : ""}</strong><span>{r.sourceLabel}</span></span>
            <span className="appliance-track" aria-hidden="true"><span style={{ width: `${(r.share / top) * 100}%` }} /></span>
            <span className="appliance-amount"><strong>{Math.round(r.share * 100)}%</strong><span>{Math.round(r.kwh)} kWh · {peso(r.pesos)}</span></span>
          </li>
        ))}
      </ul>
      <p className="muted small">Estimates from the appliances and routine you set up; they add up to your bill's kWh.</p>
    </div>
  );
}

/**
 * The last Home data per session and Household, so coming back to the Home tab shows it at once
 * while a fresh copy loads in the background (the first load still waits for the server).
 */
type HomeCache = { data?: HomeSummary; usage?: UsageMonth[]; plan?: MissionPlan | null; appliances?: ApplianceBreakdown | null };
const homeCache = new Map<string, HomeCache>();
const remember = (key: string, part: HomeCache) => homeCache.set(key, { ...homeCache.get(key), ...part });
/** Forgets every cached Home, e.g. when the session ends. */
export const clearHomeCache = () => homeCache.clear();

/**
 * Home, gamified around Eelio: a hero card with the bill, Eelio's mood and charge, three star
 * skills, the last 12 bills' kWh as bars, the appliances (once set up), and on the side every
 * Meralco charge grouped by who gets the money. The bill's full story opens as "Wrapped".
 * Parent keys it by session and SIN.
 */
export function Home({ token, household, onExpired, onAskCharge, onSave, onEditAppliances, saveCard, setup }: {
  token: string;
  household: Household;
  onExpired: () => void;
  /** "Edit" on the appliances card → the tap grid in edit mode. */
  onEditAppliances?: () => void;
  /** Opens the charge chat for one line (#50). */
  onAskCharge?: (line: HomeChargeLine, summary: HomeSummary) => void;
  /** "Want to save on your next bill?" in the bill's Wrapped → Eelio's onboarding in Missions (#51). */
  onSave?: () => void;
  /** Replaces the save card once Household Setup is done (Mission Plan summary). */
  saveCard?: ReactNode;
  /** Household Setup progress: Eelio's charge, and the appliances card once appliances are set up. */
  setup?: SetupStatus | null;
}) {
  const cacheKey = `${token}:${household.sin}`;
  const cached = homeCache.get(cacheKey);
  const [data, setData] = useState<HomeSummary | null>(cached?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageMonth[] | null>(cached?.usage ?? null);
  const [plan, setPlan] = useState<MissionPlan | null>(cached?.plan ?? null);
  const [appliances, setAppliances] = useState<ApplianceBreakdown | null>(cached?.appliances ?? null);
  const [playing, setPlaying] = useState(false);
  const smart = household.meter_type === "smart";
  const planReady = !!setup?.complete;
  const appliancesReady = !!setup?.steps.find((st) => st.key === "appliances")?.done;

  useEffect(() => {
    const controller = new AbortController();
    const fail = (err: unknown) => {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 401) onExpired();
      // A failed background refresh keeps the cached Home on screen.
      else if (!homeCache.get(cacheKey)?.data) setError(err instanceof Error ? err.message : "Couldn't load Home.");
    };
    homeApi.summary(token, household.sin, controller.signal).then((d) => { remember(cacheKey, { data: d }); setData(d); }).catch(fail);
    // A smart meter Household's usage card reads the meter instead of the last 12 Bills.
    if (!smart) {
      homeApi.usage(token, household.sin, controller.signal).then((u) => { remember(cacheKey, { usage: u }); setUsage(u); })
        .catch(() => { if (!controller.signal.aborted && !homeCache.get(cacheKey)?.usage) setUsage([]); });
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, household.sin]);

  useEffect(() => {
    if (!planReady) { setPlan(null); return; }
    const controller = new AbortController();
    missionPlanApi.get(token, household.sin, controller.signal).then((p) => { remember(cacheKey, { plan: p }); setPlan(p); }).catch(() => {});
    return () => controller.abort();
  }, [token, household.sin, planReady]);

  useEffect(() => {
    if (!appliancesReady) { setAppliances(null); return; }
    const controller = new AbortController();
    appliancesApi.breakdown(token, household.sin, controller.signal)
      .then((b) => { const next = b.rows.length ? b : null; remember(cacheKey, { appliances: next }); setAppliances(next); })
      .catch(() => { if (!controller.signal.aborted && homeCache.get(cacheKey)?.appliances === undefined) setAppliances(null); });
    return () => controller.abort();
  }, [token, household.sin, appliancesReady]);

  if (error) return <section className="card home"><p className="error" role="alert">{error}</p></section>;
  if (!data) {
    const loadedCount = (usage ? 1 : 0) + (plan ? 1 : 0) + (appliances ? 1 : 0);
    return (
      <section className="dash loading" aria-busy="true">
        <EelioLoader
          variant="bill"
          badge="Know Your Bill"
          title="Eelio is reading your bill…"
          progress={32 + loadedCount * 22}
          activeStep={Math.min(2, loadedCount)}
        />
      </section>
    );
  }

  const change = data.bakitGanito;
  const mood = moodFor(data, setup ?? null);
  const charge = chargeFor(data, setup ?? null, plan);
  const base = change ? Math.max(1, (data.bill.amountDue ?? 0) - change.total) : 1;
  const effect = (key: string) => change?.effects.find((e) => e.key === key)?.amount;
  const setupStars = setup ? Math.min(5, 1 + setup.doneCount + (plan ? 1 : 0)) : 1;

  return (
    <section className="dash home-dash" aria-label="Home">
      <div className="dash-main">
        <div className={`hero mood-${mood}`}>
          <div className="hero-copy">
            <p className="hero-hello">{greeting()} · {data.area} home</p>
            <h2>Your {month(data.bill.period)} bill</h2>
            <p className="hero-amount">{data.bill.amountDue === null ? "—" : peso(data.bill.amountDue)}
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

        <ul className="skills sr-only" aria-label="Your energy skills">
          <li><span className="skill-icon tone-a"><Svg d={ICON.bolt} /></span><Stars value={starsFrom(change?.habit, base)} label="Usage control" /><strong>Usage control</strong></li>
          <li><span className="skill-icon tone-b"><Svg d={ICON.sun} /></span><Stars value={starsFrom(effect("weather"), base)} label="Weather-proof" /><strong>Weather-proof</strong></li>
          <li><span className="skill-icon tone-c"><Svg d={ICON.target} /></span><Stars value={setupStars} label="Mission ready" /><strong>Mission ready</strong></li>
        </ul>

      </div>

      <aside className="dash-side" aria-label="Your usage and savings">
        {saveCard}
        {smart
          ? <SmartMeterUsage token={token} household={household} onExpired={onExpired} />
          : <div className="card usage-card">
            <div className="usage-head"><h3>Your usage</h3><span className="muted small">kWh · last 12 bills</span></div>
            {usage === null ? <p className="muted small">Loading…</p> : <UsageBars months={usage} />}
          </div>}
      </aside>

      <div className="dash-wide">
        <ChargesBreakdown data={data} onAsk={(line) => onAskCharge?.(line, data)} />
        {appliances && <AppliancesCard data={appliances} onEdit={onEditAppliances} />}
      </div>

      {playing && (
        <div className="wrapped-overlay" role="dialog" aria-modal="true" aria-label="Your bill, wrapped">
          <HomeWrapped data={data} onAskCharge={onAskCharge} onSave={onSave} saveCard={saveCard} onClose={() => setPlaying(false)} />
        </div>
      )}
    </section>
  );
}
