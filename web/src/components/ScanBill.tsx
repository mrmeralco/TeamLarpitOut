import { useRef, useState } from "react";
import { ApiError, linkApi, scanBill, simulateBill, type DraftBill, type LinkCorrections, type ScanOutcome } from "../api/client";
import { BackButton, Icon, ICON } from "./auth/AuthScreens";

type ReadScan = Extract<ScanOutcome, { kind: "read" }>;

const month = (period?: string) => (period && /^\d{4}-\d{2}$/.test(period)
  ? new Date(`${period}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long" }) : "—");
const shortDate = (iso?: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "");
const totalOf = (b: DraftBill | null | undefined) => {
  const lines = b?.chargeLines ?? [];
  return lines.length ? `₱${Math.round(lines.reduce((s, l) => s + l.amount, 0)).toLocaleString("en-PH")}` : "";
};
const GALLERY = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM21 15l-5-5L5 21";
const CARD = "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM7 9h10M7 13h6";
const INFO = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v4M12 16h.01";

/**
 * 5 · Scan your latest bill, then 6 · Confirm scanned values. The CAN on the Bill links the
 * Household (no CAN screen); nothing is linked until "Yes, explain my bill".
 */
export function ScanBill({ token, onLinked, onExpired, onBack, onLogout }: {
  token: string; onLinked: (householdSin: string) => void; onExpired: () => void; onBack?: () => void; onLogout?: () => void;
}) {
  const [scan, setScan] = useState<ReadScan | null>(null);
  const [typedCan, setTypedCan] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  async function onPhoto(file: File) {
    setBusy(true); setError(null);
    const out = await scanBill(file, token);
    setBusy(false);
    if (out.kind !== "read") {
      if (out.kind === "unavailable" && /HTTP 401|sign in/i.test(out.error)) return onExpired();
      setError(out.kind === "unreadable" ? out.problem : out.error);
      return;
    }
    setScan(out); setTypedCan(""); setEdits({});
  }

  async function onSimulate(meterType?: "traditional" | "smart") {
    setBusy(true); setError(null);
    const out = await simulateBill(token, meterType ? { meterType } : undefined);
    setBusy(false);
    if (out.kind !== "read") {
      if (out.kind === "unavailable" && /HTTP 401|sign in/i.test(out.error)) return onExpired();
      setError(out.kind === "unreadable" ? out.problem : out.error);
      return;
    }
    setScan(out); setTypedCan(""); setEdits({});
  }

  async function confirm() {
    if (!scan) return;
    const account = scan.account;
    if (account?.status === "alreadyLinked" && !account.demo) return onLinked(account.householdSin);
    setBusy(true); setError(null);
    try {
      const linked = await linkApi.confirm(token, scan.scanToken, account?.status === "canUnread" ? typedCan : undefined, corrections());
      onLinked(linked.householdSin);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setError(err instanceof Error ? err.message : "We couldn't link this bill right now.");
    } finally { setBusy(false); }
  }

  /** Only the numbers the person actually changed; blank or unreadable edits are ignored. */
  function corrections(): LinkCorrections {
    const n = (key: string) => {
      const raw = edits[key];
      if (raw === undefined) return undefined;
      const v = Number(raw.replace(/[₱,\s]/g, ""));
      return raw.trim() && Number.isFinite(v) && v >= 0 ? v : undefined;
    };
    const days = n("days");
    return {
      ...(n("kwh") !== undefined ? { kwh: n("kwh") } : {}),
      ...(days !== undefined && Number.isInteger(days) && days >= 1 && days <= 62 ? { billingDays: days } : {}),
      ...(n("total") !== undefined ? { totalAmount: n("total") } : {}),
    };
  }

  const fileInputs = <>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take a photo of the bill"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onPhoto(f); }} />
    <input ref={gallery} type="file" accept="image/*" hidden aria-label="Upload a bill photo"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onPhoto(f); }} />
  </>;

  if (!scan) {
    return <section className="screen" aria-labelledby="scan-title">
      {fileInputs}
      {(onBack || onLogout) && <div className="screen-head-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        {onBack ? <BackButton onClick={onBack} /> : <span />}
        {onLogout && <button type="button" className="ghost" onClick={onLogout}>Log out</button>}
      </div>}
      <div className="screen-intro">
        <h1 id="scan-title">Scan your latest Meralco bill</h1>
        <p className="lead">We read the Customer Account Number (CAN) on your bill to link your account and load 12 months of history. Make sure the CAN is visible.</p>
      </div>
      <div className="camera" aria-hidden="true">
        <div className="bill-sketch">
          <span className="bar accent" /><span className="bar w85" /><span className="bar w70" /><span className="block" />
          <span className="bar w90" /><span className="bar w80" /><span className="bar w60" />
          <span className="sketch-foot"><span className="bar w40" /><span className="total" /></span>
        </div>
        <span>{busy ? "Reading your bill…" : "Align the whole bill inside the frame"}</span>
      </div>
      {error && <div className="scan-error">
        <p className="error" role="alert">{error}</p>
        <button type="button" className="btn-outline" disabled={busy} onClick={() => void onSimulate()}>
          Continue with simulated bill
        </button>
      </div>}
      <div className="camera-controls">
        <button type="button" className="square-btn" aria-label="Upload from gallery" disabled={busy} onClick={() => gallery.current?.click()}><Icon d={GALLERY} size={22} /></button>
        <button type="button" className="shutter" aria-label="Take photo" disabled={busy} onClick={() => camera.current?.click()}><span /></button>
        <button type="button" className="square-btn" aria-label="Simulate bill scan" title="Simulate bill data" disabled={busy} onClick={() => void onSimulate()}><Icon d={ICON.receipt} size={22} /></button>
      </div>
      <div className="simulate-action">
        <button type="button" className="btn-text simulate-btn" disabled={busy} onClick={() => void onSimulate()}>
          <Icon d={ICON.bolt} size={16} /> Simulate bill data
        </button>
      </div>
    </section>;
  }

  const account = scan.account;
  const canUnread = account?.status === "canUnread";
  const nameBlocked = account?.status === "nameMismatch" || account?.status === "nameUnread";
  const blocked = nameBlocked || account?.status === "ownedByAnother" || account?.status === "unknownAccount";
  const isDemo = (account?.status === "found" || account?.status === "alreadyLinked") && account.demo === true;
  // Demo mode explains this Bill itself, so the kWh and billing days the scan missed must be typed in.
  const needed = isDemo ? scan.missing.flatMap((f) => (f === "kwh" ? ["kwh"] : f === "billingDays" ? ["days"] : [])) : [];
  const corrected = corrections();
  const filled = needed.every((k) => (k === "kwh" ? corrected.kwh !== undefined : corrected.billingDays !== undefined));
  const ready = !blocked && filled && (!canUnread || typedCan.replace(/\D/g, "").length === 10);
  const tag = account?.status === "found" || account?.status === "alreadyLinked"
    ? account.demo ? <span className="tag-warn">Demo account</span>
      : <span className="tag-ok">{account.status === "alreadyLinked" ? "Already linked" : "Read from your bill"}</span>
    : canUnread ? <span className="tag-warn">CAN not read</span>
      : blocked ? <span className="tag-bad">{account?.status === "ownedByAnother" ? "Linked to another login"
        : account?.status === "nameMismatch" ? "Name doesn't match"
        : account?.status === "nameUnread" ? "Name not read" : "Account not found"}</span> : null;
  const rows: { key: string; label: string; before: string; now: string }[] = [
    { key: "kwh", label: "Usage (kWh)", before: scan.before?.kwh !== undefined ? String(scan.before.kwh) : "", now: scan.now.kwh !== undefined ? String(scan.now.kwh) : "" },
    { key: "days", label: "Billing days", before: scan.before?.billingDays !== undefined ? String(scan.before.billingDays) : "", now: scan.now.billingDays !== undefined ? String(scan.now.billingDays) : "" },
    { key: "total", label: "Total due", before: totalOf(scan.before), now: totalOf(scan.now) },
    { key: "due", label: "Due date", before: "", now: shortDate(scan.now.dueDate) },
  ];

  return <section className="screen tinted" aria-labelledby="confirm-title">
    {fileInputs}
    <div className="screen-head left">
      <BackButton onClick={() => setScan(null)} />
      <span className="field-label">Review scan</span>
    </div>
    <div className="screen-intro">
      <h1 id="confirm-title">Does this look right?</h1>
      <p className="lead">Correct anything we misread. Nothing is used until you confirm.</p>
    </div>
    <div className="can-card">
      <Icon d={CARD} />
      <div>
        <span className="small muted">Customer Account Number</span>
        <strong>{scan.canMasked ?? "Not read"}</strong>
        {(account?.status === "found" || account?.status === "alreadyLinked") &&
          <span className="small muted">{account.area} · {account.meterType === "smart" ? "Smart meter" : "Traditional meter"} · {account.billsOnRecord} bills</span>}
      </div>
      {tag}
    </div>
    {canUnread && <div className="screen-group">
      <label className="field-label" htmlFor="typed-can">Type the CAN printed on this bill</label>
      <input id="typed-can" className="input-lg" inputMode="numeric" maxLength={20} value={typedCan} onChange={(e) => setTypedCan(e.target.value.replace(/[^\d\s-]/g, ""))} />
    </div>}
    {(account?.status === "found" || account?.status === "alreadyLinked") && account.demo &&
      <p className="notice-inline" role="status">Demo mode: this CAN isn't in the demo Meralco data. Confirming explains this bill as your latest bill; the months before it are sample {account.area} values, not your real history.</p>}
    {account?.status === "ownedByAnother" && <p className="notice-inline" role="alert">{account.message}</p>}
    {account?.status === "nameMismatch" && <p className="notice-inline" role="alert">{account.message} The name on this bill starts with {account.billNameMasked}.</p>}
    {account?.status === "nameUnread" && <p className="notice-inline" role="alert">{account.message}</p>}
    {account?.status === "unknownAccount" && <p className="notice-inline" role="alert">No Meralco account has this CAN. Retake the photo so the CAN is clear.</p>}
    <div className="compare">
      <div className="compare-head"><span /><span>{month(scan.before?.period)}</span><span>{month(scan.now.period)}</span></div>
      {rows.map((r) => (
        <div className="compare-row" key={r.key}>
          <label htmlFor={`scan-${r.key}`}>{r.label}</label>
          <span>{r.before || (r.key === "due" ? "" : "—")}</span>
          <input id={`scan-${r.key}`} value={edits[r.key] ?? r.now} aria-required={needed.includes(r.key) || undefined}
            placeholder={needed.includes(r.key) ? "Type it" : undefined} onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })} />
        </div>
      ))}
    </div>
    <p className="notice-inline with-icon"><Icon d={INFO} size={18} /><span>Confirming links this CAN to your account. {month(scan.before?.period)} figures come from its Meralco bill history.</span></p>
    {needed.length > 0 && !filled && <p className="notice-inline" role="status">We couldn't read the {needed.map((k) => (k === "kwh" ? "usage (kWh)" : "billing days")).join(" and ")} on this bill. Type {needed.length > 1 ? "them" : "it"} from the bill to continue.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="screen-bottom">
      <button type="button" className="btn-primary" disabled={busy || !ready} onClick={() => void confirm()}>{busy ? "Linking…" : "Yes, explain my bill"}</button>
      <button type="button" className="btn-text" onClick={() => camera.current?.click()}>Retake photo</button>
    </div>
  </section>;
}
