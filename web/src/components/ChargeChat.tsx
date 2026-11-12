import { useEffect, useRef, useState } from "react";
import { ApiError, chargeApi, type ChargeAnswer, type HomeChargeLine } from "../api/client";
import { peso } from "../lib/format";

const CHIPS = ["Why did this go up?", "Who sets this rate?", "Can I lower this?", "Is this correct?"];

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

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Ask about ${line.label} charge`} tabIndex={-1} ref={dialog}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <span className="muted small">Ask about this charge</span>
            <h2>{line.label} charge</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <dl className="sheet-facts">
          <div><dt>This bill</dt><dd>{peso(line.amount)}</dd></div>
          <div><dt>vs. {previousMonth ?? "last month"}</dt><dd className={line.change && line.change > 0 ? "up" : line.change && line.change < 0 ? "down" : ""}>{line.change === null ? "—" : peso(line.change, true)}</dd></div>
          <div><dt>Goes to</dt><dd>{line.goesTo ?? "Unknown"}</dd></div>
        </dl>

        <div className="sheet-thread" aria-live="polite">
          {asked && <p className="bubble me">{asked}</p>}
          {busy && <p className="bubble them muted">Answering…</p>}
          {answer && <div className="bubble them">
            <p>{answer.answer}</p>
            {answer.kind === "askMeralco" && answer.summary && <>
              <p className="small muted">{answer.summary}</p>
              <button type="button" className="ghost wide" onClick={() => copy(answer.summary!)}>{copied ? "Copied ✓" : "Copy the summary for Meralco"}</button>
            </>}
            {answer.sources?.[0] && <details className="small muted">
              <summary>From Meralco's bill guide: {answer.sources[0].title}</summary>
              <p>{answer.sources[0].text}</p>
              <a href={answer.sources[0].url} target="_blank" rel="noreferrer">meralco.com.ph</a>
            </details>}
          </div>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <div className="chips">
          {CHIPS.map((c) => <button key={c} type="button" className="chip" disabled={busy} onClick={() => void send(c)}>{c}</button>)}
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
