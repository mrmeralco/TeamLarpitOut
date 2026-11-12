import { useEffect, useState } from "react";
import { ApiError, homeApi, type HomeChargeLine, type HomePart, type Household, type HomeSummary } from "../api/client";
import { peso } from "../lib/format";

const BADGE: Record<HomeSummary["badge"]["status"], string> = { green: "Bill verified", yellow: "Higher than usual", red: "Something doesn't match" };
const EFFECT_LABEL: Record<string, (amount: number) => string> = {
  rate: () => "Rate",
  billingDays: () => "Billing days",
  weather: (a) => (a >= 0 ? "Hotter weather" : "Cooler weather"),
  habit: () => "Household usage",
  lifeline: () => "Lifeline discount",
  catchUp: () => "Estimate catch-up",
};
const EFFECT_COLOR: Record<string, string> = { rate: "var(--chart-5)", billingDays: "var(--chart-3)", weather: "var(--chart-2)", habit: "var(--primary)" };

const month = (period: string) => new Date(`${period}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
/** Whole pesos for tiles: "+₱937". */
const wholePeso = (centavos: number, signed = true) => {
  const s = `₱${Math.round(Math.abs(centavos) / 100).toLocaleString("en-PH")}`;
  return centavos < 0 ? `−${s}` : signed && centavos > 0 ? `+${s}` : s;
};
function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function ChargeButton({ line, onAsk }: { line: HomeChargeLine; onAsk?: (line: HomeChargeLine) => void }) {
  return (
    <button type="button" className="charge" onClick={() => onAsk?.(line)}
      aria-label={`${line.label}: ${peso(line.amount)}${line.change !== null ? `, ${peso(line.change, true)} vs. last month` : ""}${line.goesTo ? `, ${line.goesTo}` : ""}. Ask about this charge`}>
      <span className="charge-head">{line.label}
        {line.change !== null && <span className={line.change > 0 ? "up" : line.change < 0 ? "down" : "muted"}>{wholePeso(line.change)}</span>}
      </span>
      <span className="muted">{wholePeso(line.amount, false)}{line.goesTo ? ` · ${line.goesTo}` : ""}</span>
    </button>
  );
}

/**
 * Home is the explanation of the latest Bill (mockup screen 6): amount due, why it changed
 * (four effects that add up), every charge line as a button, and the save card.
 * Parent keys it by session and SIN.
 */
export function Home({ token, household, onExpired, onAskCharge, onSave, saveCard }: {
  token: string;
  household: Household;
  onExpired: () => void;
  /** Opens the charge chat for one line (#50). */
  onAskCharge?: (line: HomeChargeLine, summary: HomeSummary) => void;
  /** "Want to save on your next bill?" → rewards onboarding (#51). */
  onSave?: () => void;
  /** Replaces the save card once Household Setup is done (Mission Plan summary). */
  saveCard?: React.ReactNode;
}) {
  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    homeApi
      .summary(token, household.sin, controller.signal)
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) onExpired();
        else setError(err instanceof Error ? err.message : "Couldn't load Home.");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, household.sin]);

  if (error) return <section className="card home"><p className="error" role="alert">{error}</p></section>;
  if (!data) return <section className="card home"><p className="muted">Loading your Bill…</p></section>;

  const action = data.action;
  const change = data.bakitGanito;
  const parts: HomePart[] = change ? [...change.effects, ...change.lines] : [];
  const barTotal = parts.reduce((s, p) => s + Math.abs(p.amount), 0) || 1;
  const ask = (line: HomeChargeLine) => onAskCharge?.(line, data);

  async function copySummary() {
    if (action.kind !== "askMeralco") return;
    try { await navigator.clipboard.writeText(action.summary); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <section className={`home2 badge-${data.badge.status}`} aria-label="Home" aria-live="polite">
      <div className="home-top">
        <div>
          <span className="muted small">{data.area} home{data.canMasked ? ` · CAN ${data.canMasked}` : ""}</span>
          <h2>{greeting()}</h2>
        </div>
        <span className={`home-badge ${data.badge.status}`}><span className="dot" aria-hidden="true" />{BADGE[data.badge.status]}</span>
      </div>

      <div className="home-grid">
      <div className="home-main">
      {action.kind === "askMeralco" && (
        <div className="card home-ask" role="alert">
          <strong>Ask Meralco</strong>
          <p className="muted">{data.tamaBa.failedChecks} Bill Check(s) don't match. The app never files complaints; copy the summary if you want to ask Meralco.</p>
          <p className="small">{action.summary}</p>
          <button type="button" className="ghost wide" onClick={copySummary}>{copied ? "Copied ✓" : "Copy summary"}</button>
        </div>
      )}

      <div className="card home-due">
        <div>
          <span className="muted small">{month(data.bill.period)} bill{data.bill.dueDate ? ` · due ${shortDate(data.bill.dueDate)}` : ""}</span>
          <strong className="home-amount">{data.bill.amountDue === null ? "—" : wholePeso(data.bill.amountDue, false)}</strong>
        </div>
        {change && <div className="home-change">
          <strong className={change.total > 0 ? "up" : change.total < 0 ? "down" : ""}>{wholePeso(change.total)}</strong>
          <span className="muted small">vs. {month(change.previousPeriod)}</span>
        </div>}
      </div>

      {change ? <>
        <h3>{change.total >= 0 ? "Why it went up" : "Why it went down"}</h3>
        <div className="effect-bar" role="img" aria-label={parts.map((p) => `${(EFFECT_LABEL[p.key] ?? (() => p.label))(p.amount)} ${wholePeso(p.amount)}`).join(", ")}>
          {parts.map((p) => <span key={p.key} style={{ width: `${(Math.abs(p.amount) / barTotal) * 100}%`, background: EFFECT_COLOR[p.key] ?? "var(--chart-1)" }} />)}
        </div>
        <ul className="effect-tiles">
          {parts.map((p) => (
            <li key={p.key} className={p.key === "habit" ? "habit" : ""}>
              <span className="muted small"><i style={{ background: EFFECT_COLOR[p.key] ?? "var(--chart-1)" }} aria-hidden="true" />{(EFFECT_LABEL[p.key] ?? (() => p.label))(p.amount)}</span>
              <strong>{wholePeso(p.amount)}</strong>
            </li>
          ))}
        </ul>
        <p className="small muted">{change.addsUp ? `✓ Adds up: ${peso(change.total, true)}` : "The total doesn't add up yet; see Bill Checks."}</p>
      </> : <p className="muted">{data.bakitGanitoUnavailable}</p>}
      </div>

      <div className="home-side">
      {data.chargeLines.all.length > 0 && <>
        <div className="section-head"><h3>Charges on your bill</h3><span className="muted small">Tap any charge to ask</span></div>
        <div className="charges">
          {data.chargeLines.featured.map((l) => <ChargeButton key={l.id} line={l} onAsk={ask} />)}
          <button type="button" className="charge" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            <span className="charge-head">{showAll ? "Hide list" : `View all ${data.chargeLines.all.length}`}<span className="muted">{showAll ? "‹" : "›"}</span></span>
            <span className="muted">Itemized bill</span>
          </button>
        </div>
        {showAll && <div className="charges all" aria-label="All charges">
          {data.chargeLines.all.map((l) => <ChargeButton key={l.id} line={l} onAsk={ask} />)}
        </div>}
      </>}

      {saveCard ?? (
        <button type="button" className="save-card" onClick={onSave}>
          <span>
            <strong>Want to save on your next bill?</strong>
            <span>{change && change.habit > 0
              ? `${wholePeso(change.habit, false)} came from usage. Cut it and earn points.`
              : "Use a little less and earn points on your next bill."}</span>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}
      </div>
      </div>
    </section>
  );
}
