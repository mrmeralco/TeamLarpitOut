import { useEffect, useRef, useState } from "react";
import { ApiError, linkApi, scanBill, type LinkActivation, type LinkSummary, type ScanOutcome } from "../api/client";
import { monthLabel } from "../lib/format";

type Step = "can" | "scan" | "review";
type ReadScan = Extract<ScanOutcome, { kind: "read" }>;

const REASON: Record<string, string> = {
  differentAccount: "This bill shows a different account. Scan the latest bill for the CAN you typed.",
  canUnread: "We couldn't read the CAN on this bill. Type it exactly as printed on the bill.",
};

/**
 * Account Linking (ADR-0005): type the CAN → masked summary → scan the latest Bill →
 * "Is this right?" with whether the CAN matches. One screen at a time.
 */
export function LinkFlow({ token, onLinked, onExpired, onCancel }: {
  token: string;
  onLinked: (householdSin: string) => void;
  onExpired: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<Step>("can");
  const [can, setCan] = useState("");
  const [summary, setSummary] = useState<LinkSummary | null>(null);
  const [scan, setScan] = useState<ReadScan | null>(null);
  const [link, setLink] = useState<LinkActivation | null>(null);
  const [typedCan, setTypedCan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);

  // Resume a pending link after a reload.
  useEffect(() => {
    const controller = new AbortController();
    linkApi.pending(token, controller.signal).then(({ pending }) => {
      if (pending) { setSummary(pending); setStep("scan"); }
    }).catch((err) => { if (err instanceof ApiError && err.status === 401) onExpired(); });
    return () => controller.abort();
  }, [token, onExpired]);

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) return onExpired();
    setError(err instanceof Error ? err.message : fallback);
  };

  async function lookUp() {
    setBusy(true); setError(null);
    try {
      const found = await linkApi.start(token, can);
      if (found.status === "active" && found.householdSin) return onLinked(found.householdSin);
      setSummary(found);
    } catch (err) { fail(err, "Couldn't check the CAN right now."); } finally { setBusy(false); }
  }

  async function onPhoto(file: File) {
    setBusy(true); setError(null);
    const out = await scanBill(file, token);
    setBusy(false);
    if (out.kind !== "read") {
      if (out.kind === "unavailable" && /HTTP 401|sign in/i.test(out.error)) return onExpired();
      setError(out.kind === "unreadable" ? out.problem : out.error);
      return;
    }
    setScan(out); setLink(out.link ?? null); setTypedCan(""); setStep("review");
  }

  async function confirmTyped() {
    if (!scan) return;
    setBusy(true); setError(null);
    try { setLink(await linkApi.confirmTyped(token, scan.scanToken, typedCan)); }
    catch (err) { fail(err, "Couldn't check the CAN right now."); } finally { setBusy(false); }
  }

  const back = (to: Step | null) => () => { setError(null); if (to) setStep(to); else onCancel?.(); };

  if (step === "can") {
    return <section className="card flow">
      {onCancel && <button type="button" className="back" aria-label="Back" onClick={back(null)}>‹</button>}
      <h2>Link your Meralco account</h2>
      <p className="muted">Enter the Customer Account Number (CAN) printed on your bill. We'll load your bill history from Meralco.</p>
      <form onSubmit={(e) => { e.preventDefault(); void lookUp(); }}>
        <label>Customer Account Number
          <input inputMode="numeric" autoComplete="off" required maxLength={20} value={can}
            onChange={(e) => { setCan(e.target.value.replace(/[^\d\s-]/g, "")); setSummary(null); }} />
        </label>
        <details className="small"><summary>Where do I find my CAN?</summary>
          <p className="muted">It's the 10-digit Customer Account Number near the top of your Meralco bill.</p></details>
        {!summary && <button className="primary" disabled={busy || can.replace(/\D/g, "").length !== 10}>{busy ? "Checking…" : "Find account"}</button>}
      </form>
      {summary && <>
        <div className="link-summary" aria-live="polite">
          <strong>✓ Account found</strong>
          <span className="muted">{summary.area} · {summary.meterType === "smart" ? "Smart meter" : "Traditional meter"}</span>
          <span className="muted small">
            {summary.billsOnRecord} bills on record{summary.firstPeriod && summary.lastPeriod ? ` · ${monthLabel(summary.firstPeriod)} – ${monthLabel(summary.lastPeriod)}` : ""}
          </span>
        </div>
        <p className="notice-inline">To confirm the account is yours, the bill you scan next must show this same CAN.</p>
        <button type="button" className="primary" onClick={() => setStep("scan")}>Continue</button>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>;
  }

  if (step === "scan") {
    return <section className="card flow">
      <div className="card-head">
        <button type="button" className="back" aria-label="Back" onClick={back("can")}>‹</button>
        {summary && <span className="pill">CAN {summary.canMasked}</span>}
      </div>
      <h2>Now scan your latest bill</h2>
      <p className="muted">We'll compare it with your history and explain every charge, line by line.</p>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onPhoto(f); }} />
      <button type="button" className="primary scan" disabled={busy} onClick={() => photo.current?.click()}>
        {busy ? "Reading…" : "📷 Scan the Bill"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>;
  }

  const now = scan!.now;
  const matched = link?.status === "active";
  const tag = matched ? <span className="tag ok">Matches linked CAN</span>
    : link?.status === "pending" && link.reason === "differentAccount" ? <span className="tag bad">Different account</span>
      : link?.status === "pending" ? <span className="tag warn">CAN not read</span>
        : link?.status === "refused" ? <span className="tag bad">Linked to another login</span> : null;

  return <section className="card flow">
    <button type="button" className="back" aria-label="Back" onClick={back("scan")}>‹</button>
    <h2>Is this right?</h2>
    <p className="muted">Correct anything we misread. Nothing is used until you confirm.</p>
    <div className="can-row">
      <div><span className="muted small">Customer Account Number</span><br /><strong>{scan!.canMasked ?? "—"}</strong></div>
      {tag}
    </div>
    <dl className="review">
      <div><dt>Bill month</dt><dd>{now.period ? monthLabel(now.period) : "—"}</dd></div>
      <div><dt>Usage (kWh)</dt><dd>{now.kwh ?? "—"}</dd></div>
      <div><dt>Billing days</dt><dd>{now.billingDays ?? "—"}</dd></div>
      {now.dueDate && <div><dt>Due date</dt><dd>{now.dueDate}</dd></div>}
    </dl>
    {link?.status === "pending" && <p className="notice-inline" role="alert">{REASON[link.reason]}</p>}
    {link?.status === "refused" && <p className="notice-inline" role="alert">{link.message}</p>}
    {link?.status === "pending" && link.reason === "canUnread" && <form onSubmit={(e) => { e.preventDefault(); void confirmTyped(); }}>
      <label>CAN printed on this bill
        <input inputMode="numeric" required maxLength={20} value={typedCan} onChange={(e) => setTypedCan(e.target.value.replace(/[^\d\s-]/g, ""))} />
      </label>
      <button className="primary" disabled={busy || typedCan.replace(/\D/g, "").length !== 10}>Check CAN</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" className="primary" disabled={!matched} onClick={() => matched && onLinked(link.householdSin)}>Yes, explain my bill</button>
    <button type="button" className="ghost" onClick={back("scan")}>Retake photo</button>
  </section>;
}
