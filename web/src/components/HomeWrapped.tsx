import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { HomeChargeLine, HomePart, HomeSummary } from "../api/client";
import { peso } from "../lib/format";

const EFFECT_LABEL: Record<string, (amount: number) => string> = {
  rate: () => "Rate",
  billingDays: () => "Billing days",
  weather: (a) => (a >= 0 ? "Hotter weather" : "Cooler weather"),
  habit: () => "Household usage",
  lifeline: () => "Lifeline discount",
  catchUp: () => "Estimate catch-up",
};
const EFFECT_NOTE: Record<string, string> = {
  rate: "Meralco's price per kWh changed.",
  billingDays: "This bill covered a different number of days.",
  weather: "Heat makes aircons and fans work harder.",
  habit: "How your household used power. This is the part you control.",
};
const effectLabel = (p: HomePart) => (EFFECT_LABEL[p.key] ?? (() => p.label))(p.amount);

export const month = (period: string) => new Date(`${period}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
/** Whole pesos: "+₱937". */
export const wholePeso = (centavos: number, signed = true) => {
  const s = `₱${Math.round(Math.abs(centavos) / 100).toLocaleString("en-PH")}`;
  return centavos < 0 ? `−${s}` : signed && centavos > 0 ? `+${s}` : s;
};
/** Pesos formatted to 2 decimal places without a sign, for sentences that already say "more" or "less". */
export const plainPeso = (centavos: number) => peso(Math.abs(centavos), false);
export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Counts up to a peso amount when the slide opens; shows the final value at once without motion support. */
function CountUp({ centavos, signed = false }: { centavos: number; signed?: boolean }) {
  const animate = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(animate ? 0 : centavos);
  useEffect(() => {
    if (!animate) { setShown(centavos); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setShown(Math.round(centavos * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [centavos, animate]);
  return <span aria-hidden="true">{peso(shown, signed)}</span>;
}

function ChargeButton({ line, rank, share, onAsk }: { line: HomeChargeLine; rank?: number; share?: number; onAsk?: (line: HomeChargeLine) => void }) {
  return (
    <button type="button" className="wr-charge" onClick={() => onAsk?.(line)}
      aria-label={`${line.label}: ${peso(line.amount)}${line.change !== null ? `, ${peso(line.change, true)} vs. last month` : ""}${line.goesTo ? `, ${line.goesTo}` : ""}. Ask about this charge`}>
      {rank !== undefined && <span className="wr-rank" aria-hidden="true">{rank}</span>}
      <span className="wr-charge-name">
        <strong>{line.label}</strong>
        <span>{line.goesTo ?? "Charge"}{share !== undefined ? ` · ${Math.round(share * 100)}%` : ""}</span>
      </span>
      <span className="wr-charge-amount">
        <strong>{peso(line.amount)}</strong>
        {line.change !== null && line.change !== 0 && <span className={line.change > 0 ? "up" : "down"}>{peso(line.change, true)}</span>}
      </span>
    </button>
  );
}

interface Slide { key: string; tone: string; label: string; body: ReactNode }

/**
 * The latest Bill as a "Wrapped" story, opened from Home: the amount, how it compares with last
 * month, what moved it, where the money went (every charge opens the charge chat), and the next move.
 */
export function HomeWrapped({ data, onAskCharge, onSave, saveCard, onClose }: {
  data: HomeSummary;
  /** Opens the charge chat for one line (#50). */
  onAskCharge?: (line: HomeChargeLine, summary: HomeSummary) => void;
  /** "Want to save on your next bill?" → rewards onboarding (#51). */
  onSave?: () => void;
  /** Replaces the save card once Household Setup is done (Mission Plan summary). */
  saveCard?: React.ReactNode;
  /** Closes the story (it opens over Home). */
  onClose?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const slides = buildSlides(data);
  const count = slides.length;
  const go = useCallback((next: number) => { setIndex(Math.max(0, Math.min(count - 1, next))); setShowAll(false); }, [count]);

  function buildSlides(d: HomeSummary): Slide[] {
    const change = d.bakitGanito;
    const amount = d.bill.amountDue;
    const billMonth = month(d.bill.period);
    const ask = (line: HomeChargeLine) => onAskCharge?.(line, d);
    const out: Slide[] = [];

    out.push({
      key: "intro", tone: "tone-brand", label: `Your ${billMonth} bill`,
      body: <>
        <div className="wr-story-badge" aria-hidden="true">
          <span className="wr-badge-spark">⚡</span>
          <span>Story 1 of 5 · Bill Recap</span>
        </div>
        <p className="wr-eyebrow">{greeting()} · {d.area} home</p>
        <h2 className="wr-title">Your {billMonth} bill, wrapped</h2>
        <p className="wr-big" aria-label={amount === null ? "Amount not available" : `Amount due ${peso(amount)}`}>
          {amount === null ? "—" : <CountUp centavos={amount} />}
        </p>
        <p className="wr-sub">{d.bill.dueDate ? `Due ${shortDate(d.bill.dueDate)}` : "Amount due"}{d.canMasked ? ` · CAN ${d.canMasked}` : ""}</p>
        <p className="wr-hint" aria-hidden="true">Tap to see what happened →</p>
        <img src="/mascot/eelio-hero.png" alt="" className="wr-mascot-float" aria-hidden="true" />
      </>,
    });

    if (change) {
      const less = change.total < 0;
      out.push({
        key: "change", tone: less ? "tone-teal" : "tone-ink", label: `Compared with ${month(change.previousPeriod)}`,
        body: <>
          <div className="wr-story-badge" aria-hidden="true">
            <span className="wr-badge-spark">{less ? "✨" : "📈"}</span>
            <span>Story 2 of 5 · Monthly Shift</span>
          </div>
          <p className="wr-eyebrow">Compared with {month(change.previousPeriod)}</p>
          <p className="wr-big" aria-label={`${peso(change.total, true)} vs. ${month(change.previousPeriod)}`}>
            {change.total === 0 ? "₱0" : <CountUp centavos={change.total} signed />}
          </p>
          <h2 className="wr-title">
            {change.total === 0 ? "Exactly the same as last month." : less
              ? `You paid ${plainPeso(change.total)} less than in ${month(change.previousPeriod)}.`
              : `You paid ${plainPeso(change.total)} more than in ${month(change.previousPeriod)}.`}
          </h2>
          {change.addsUp && <p className="wr-sub">Every peso of the change is explained next.</p>}
          <img src={less ? "/mascot/eelio-hero.png" : "/mascot/eelio-detective.png"} alt="" className="wr-mascot-float" aria-hidden="true" />
        </>,
      });

      const parts = [...change.effects, ...change.lines].filter((p) => p.amount !== 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      const top = parts[0];
      const max = Math.abs(top?.amount ?? 1) || 1;
      if (top) out.push({
        key: "reasons", tone: "tone-cream", label: "What moved your bill",
        body: <>
          <div className="wr-story-badge" aria-hidden="true">
            <span className="wr-badge-spark">🔍</span>
            <span>Story 3 of 5 · Impact Breakdown</span>
          </div>
          <p className="wr-eyebrow">What moved your bill</p>
          <h2 className="wr-title">#1: <span className="wr-accent">{effectLabel(top)}</span> {top.amount > 0 ? "added" : "saved you"} {plainPeso(top.amount)}.</h2>
          <p className="wr-sub">{EFFECT_NOTE[top.key] ?? ""}</p>
          <ol className="wr-reasons">
            {parts.map((p, i) => (
              <li key={p.key} className={p.key === "habit" ? "habit" : ""}>
                <span className="wr-rank" aria-hidden="true">{i + 1}</span>
                <span className="wr-reason-name">{effectLabel(p)}</span>
                <span className="wr-reason-bar" aria-hidden="true"><span className={p.amount > 0 ? "up" : "down"} style={{ width: `${(Math.abs(p.amount) / max) * 100}%` }} /></span>
                <strong className={p.amount > 0 ? "up" : "down"}>{peso(p.amount, true)}</strong>
              </li>
            ))}
          </ol>
          {change.addsUp && <p className="wr-sub small">✓ Adds up to {peso(change.total, true)}</p>}
        </>,
      });
    } else if (d.bakitGanitoUnavailable) {
      out.push({
        key: "change", tone: "tone-ink", label: "Compared with last month",
        body: <><p className="wr-eyebrow">Compared with last month</p><h2 className="wr-title">{d.bakitGanitoUnavailable}</h2></>,
      });
    }

    if (d.chargeLines.all.length > 0) {
      const total = d.chargeLines.all.reduce((s, l) => s + Math.max(0, l.amount), 0) || 1;
      const ranked = [...d.chargeLines.featured].sort((a, b) => b.amount - a.amount);
      out.push({
        key: "charges", tone: "tone-plum", label: "Where your money went",
        body: <>
          <div className="wr-story-badge" aria-hidden="true">
            <span className="wr-badge-spark">💳</span>
            <span>Story 4 of 5 · Top Charges</span>
          </div>
          <p className="wr-eyebrow">Where your money went</p>
          <h2 className="wr-title">Your top charges</h2>
          <p className="wr-sub">Tap any charge to ask about it.</p>
          {!showAll ? <div className="wr-charges">
            {ranked.map((l, i) => <ChargeButton key={l.id} line={l} rank={i + 1} share={l.amount / total} onAsk={ask} />)}
          </div> : <div className="wr-charges all" aria-label="All charges">
            {d.chargeLines.all.map((l) => <ChargeButton key={l.id} line={l} onAsk={ask} />)}
          </div>}
          <button type="button" className="wr-link" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show top charges" : `View all ${d.chargeLines.all.length} charges`}
          </button>
        </>,
      });
    }

    out.push({
      key: "next", tone: "tone-brand", label: "Your next move",
      body: <>
        <div className="wr-story-badge" aria-hidden="true">
          <span className="wr-badge-spark">🎯</span>
          <span>Story 5 of 5 · Savings Quest</span>
        </div>
        <p className="wr-eyebrow">Your next move</p>
        <h2 className="wr-title">{change && change.habit > 0
          ? `${peso(change.habit)} came from how you used power. Win it back next month.`
          : "Use a little less next month and earn points."}</h2>
        {saveCard ?? (
          <button type="button" className="wr-cta" onClick={onSave}>
            <span><strong>Want to save on your next bill?</strong>
              <span>{change && change.habit > 0 ? `${peso(change.habit)} came from usage. Cut it and earn points.` : "Use a little less and earn points on your next bill."}</span>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        )}
        <button type="button" className="wr-link" onClick={() => go(0)}>Replay</button>
        <img src="/mascot/eelio-hero.png" alt="" className="wr-mascot-float" aria-hidden="true" />
      </>,
    });
    return out;
  }

  const current = slides[Math.min(index, count - 1)]!;
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    if (e.key === "Escape" && onClose) { e.preventDefault(); onClose(); }
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  };
  /** Tapping the empty part of a slide moves like a story: left third back, the rest forward. */
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input, [role=dialog]")) return;
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? index - 1 : index + 1);
  };

  return (
    <section className="wrapped" aria-label="Your bill, wrapped" aria-roledescription="carousel" onKeyDown={onKey}>
      {onClose && <button type="button" className="wr-close" aria-label="Close" onClick={onClose}>×</button>}
      <div className="wr-progress" role="tablist" aria-label="Slides">
        {slides.map((s, i) => (
          <button key={s.key} type="button" role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}: ${s.label}`}
            className={i < index ? "done" : i === index ? "on" : ""} onClick={() => go(i)}><span /></button>
        ))}
      </div>
      <div key={current.key} className={`wr-slide ${current.tone}`} role="group" aria-roledescription="slide"
        aria-label={`${index + 1} of ${count}: ${current.label}`} onClick={onTap}>
        {current.body}
      </div>
      <div className="wr-nav">
        <button type="button" className="wr-arrow" aria-label="Previous slide" disabled={index === 0} onClick={() => go(index - 1)}>‹</button>
        <span className="wr-count" aria-live="polite">{index + 1} / {count}</span>
        <button type="button" className="wr-arrow" aria-label="Next slide" disabled={index === count - 1} onClick={() => go(index + 1)}>›</button>
      </div>
    </section>
  );
}
