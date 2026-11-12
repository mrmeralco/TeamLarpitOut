import { useEffect, useRef, useState } from "react";
import { ApiError, chargeApi, type ChargeAnswer, type HomeChargeLine } from "../api/client";
import { peso } from "../lib/format";

const ICON = {
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  scale: "M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z",
  down: "M12 3v14M6 11l6 6 6-6M5 21h14",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  check: "M9 12l2 2 4-4M12 3l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.7 1 2.7-2.4 1.8-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9L3.3 14.7l1-2.7-1-2.7 2.4-1.8.9-2.9 3 .2z",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 8h3.5a2.5 2.5 0 0 1 0 5H9.5M9.5 8v9M8 10.5h8",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  flat: "M5 12h14",
};
const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** Quick questions as quest cards; each one asked gets a check. */
const QUESTS: { q: string; icon: string; tone: string }[] = [
  { q: "Why did this go up?", icon: ICON.trend, tone: "a" },
  { q: "Who sets this rate?", icon: ICON.scale, tone: "b" },
  { q: "Can I lower this?", icon: ICON.bulb, tone: "c" },
  { q: "Is this correct?", icon: ICON.check, tone: "d" },
];

/**
 * Bottom sheet for one charge line (mockup screen 7). Each question is answered on its own;
 * nothing is kept on the server, and only the last question and answer are shown.
 */
export function ChargeChat({ token, sin, line, previousMonth, onClose, onExpired }: {
  token: string; sin: string; line: HomeChargeLine; previousMonth: string | null; onClose: () => void; onExpired: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<ChargeAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [explored, setExplored] = useState<Set<string>>(() => new Set());
  const version = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    dialog.current?.addEventListener("keydown", onKey);
    const node = dialog.current;
    return () => node?.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    const v = ++version.current;
    setBusy(true); setError(null); setAsked(text); setAnswer(null); setQuestion(""); setCopied(false);
    if (QUESTS.some((x) => x.q === text)) setExplored((prev) => new Set(prev).add(text));
    try {
      const out = await chargeApi.ask(token, sin, line.id, text);
      if (v === version.current) setAnswer(out);
    } catch (err) {
      if (v !== version.current) return;
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(err instanceof Error ? err.message : "Couldn't answer right now. Please try again.");
    } finally {
      if (v === version.current) setBusy(false);
    }
  }

  async function copy(summary: string) {
    try { await navigator.clipboard.writeText(summary); setCopied(true); } catch { setCopied(false); }
  }

  const trend = line.change === null || line.change === 0 ? "flat" : line.change > 0 ? "up" : "down";

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Ask about ${line.label} charge`} tabIndex={-1} ref={dialog}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div className="sheet-title-group">
            <img src="/mascot/eelio-detective.png" alt="" className={`sheet-eelio-avatar${busy ? " thinking" : ""}`} aria-hidden="true" />
            <div>
              <span className="sheet-eelio-tag">
                <span className="badge-spark" aria-hidden="true">⚡</span>
                Eelio Bill Detective
              </span>
              <h2>{line.label} charge</h2>
            </div>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <dl className="charge-stats">
          <div className="charge-stat">
            <span className="stat-icon tone-a"><Svg d={ICON.coin} /></span>
            <dt>This bill</dt><dd>{peso(line.amount)}</dd>
          </div>
          <div className={`charge-stat ${trend}`}>
            <span className="stat-icon tone-trend"><Svg d={trend === "up" ? ICON.trend : trend === "down" ? ICON.down : ICON.flat} /></span>
            <dt>vs. {previousMonth ?? "last month"}</dt><dd>{line.change === null ? "—" : peso(line.change, true)}</dd>
          </div>
          <div className="charge-stat">
            <span className="stat-icon tone-c"><Svg d={ICON.flag} /></span>
            <dt>Goes to</dt><dd>{line.goesTo ?? "Unknown"}</dd>
          </div>
        </dl>

        <div className="sheet-thread" aria-live="polite">
          {!asked && !answer && (
            <div className="bubble-row them">
              <div className="bubble them intro">
                <p>Hi! Pick a question card below, or type your own about your {line.label} charge.</p>
              </div>
            </div>
          )}
          {asked && (
            <div className="bubble-row me">
              <p className="bubble me">{asked}</p>
            </div>
          )}
          {busy && (
            <div className="bubble-row them">
              <div className="bubble them muted">
                <p className="typing" aria-label="Answering…"><span /><span /><span /></p>
              </div>
            </div>
          )}
          {answer && (
            <div className="bubble-row them">
              <div className="bubble them">
                <p>{answer.answer}</p>
                {answer.kind === "askMeralco" && answer.summary && (
                  <>
                    <p className="small muted">{answer.summary}</p>
                    <button type="button" className="ghost wide" onClick={() => copy(answer.summary!)}>
                      {copied ? "Copied ✓" : "Copy the summary for Meralco"}
                    </button>
                  </>
                )}
                {answer.sources?.[0] && (
                  <details className="small muted">
                    <summary>From Meralco's bill guide: {answer.sources[0].title}</summary>
                    <p>{answer.sources[0].text}</p>
                    <a href={answer.sources[0].url} target="_blank" rel="noreferrer">meralco.com.ph</a>
                  </details>
                )}
              </div>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <div className="quests">
          <div className="quests-head">
            <span>Quick questions</span>
            <span className="quests-progress" aria-label={`${explored.size} of ${QUESTS.length} explored`}>
              {QUESTS.map((x) => <span key={x.q} className={explored.has(x.q) ? "on" : ""} aria-hidden="true" />)}
              <b aria-hidden="true">{explored.size}/{QUESTS.length}</b>
            </span>
          </div>
          <div className="quest-grid">
            {QUESTS.map((x) => (
              <button key={x.q} type="button" className={`quest${explored.has(x.q) ? " done" : ""}`} disabled={busy} onClick={() => void send(x.q)}>
                <span className={`quest-icon tone-${x.tone}`}><Svg d={x.icon} />{explored.has(x.q) && <span className="quest-check" aria-hidden="true">✓</span>}</span>
                <span className="quest-label">{x.q}</span>
              </button>
            ))}
          </div>
        </div>
        <form className="sheet-ask" onSubmit={(e) => { e.preventDefault(); void send(question); }}>
          <label className="sr-only" htmlFor="charge-question">Ask a question</label>
          <input id="charge-question" placeholder="Ask about this charge…" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <button type="submit" className="send" aria-label="Send" disabled={busy || !question.trim()}>↑</button>
        </form>
        <p className="small muted center">Answers use only your bill's figures. Each question is answered on its own; nothing is saved.</p>
      </div>
    </div>
  );
}
