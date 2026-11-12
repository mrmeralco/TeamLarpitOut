import { useEffect, useRef, useState } from "react";
import {
  explainGuestBill,
  scanGuestBill,
  simulateGuestBill,
  type GuestBillExplanation,
  type GuestChargeLine,
} from "../api/client";
import { peso } from "../lib/format";
import { AuthLayout } from "./auth/AuthLayout";
import { BackButton, Icon, ICON } from "./auth/AuthScreens";
import { EelioLoader } from "./EelioLoader";

const month = (period?: string | null) =>
  period && /^\d{4}-\d{2}$/.test(period)
    ? new Date(`${period}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long" })
    : "Current";

const shortDate = (iso?: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "";

const GALLERY = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM21 15l-5-5L5 21";

function CountUpPeso({ centavos }: { centavos: number }) {
  const animate =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(animate ? 0 : centavos);
  useEffect(() => {
    if (!animate) {
      setShown(centavos);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 750);
      setShown(Math.round(centavos * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [centavos, animate]);
  return <>{peso(shown)}</>;
}

const GROUPS: { key: string; label: string; note: string; icon: string }[] = [
  { key: "Pass-through", label: "Pass-through", note: "Collected by Meralco and passed directly to power plants and the grid.", icon: "M13 2 4 14h7l-1 8 9-12h-7z" },
  { key: "Meralco", label: "Meralco", note: "Meralco's own fee for running the poles, wires, and meters to your home.", icon: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5" },
  { key: "Government", label: "Government", note: "Taxes and government charges remitted to BIR and local government.", icon: "M3 21h18M4 10h16M12 3l9 5H3zM6 10v8M10 10v8M14 10v8M18 10v8" },
  { key: "Subsidy", label: "Subsidies", note: "Discounts for lifeline and senior citizen customers, set by law.", icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
  { key: "Other", label: "Other", note: "Other charges printed on the bill.", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

function GuestChargesSection({ data }: { data: GuestBillExplanation }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exploredIds, setExploredIds] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>("All");

  const all = [...data.chargeLines.all].sort((a, b) => b.amount - a.amount);
  const lines = all.filter((l) => l.amount !== 0);
  if (lines.length === 0) {
    return (
      <section className="card charges-card" aria-label="What's on your bill">
        <h3>What's on your bill</h3>
        <p className="muted small">No individual charge lines were read from this bill photo.</p>
      </section>
    );
  }
  const total = lines.reduce((s, l) => s + Math.max(0, l.amount), 0) || 1;
  const kwh = data.bill.kwh && data.bill.kwh > 0 ? data.bill.kwh : null;
  const groupOf = (l: GuestChargeLine) => (GROUPS.some((g) => g.key === l.goesTo) ? l.goesTo! : "Other");
  const toneOf = (key: string) => key.toLowerCase().replace(/\W/g, "");
  const groups = GROUPS.map((g) => ({
    ...g,
    amount: lines.filter((l) => groupOf(l) === g.key).reduce((s, l) => s + Math.max(0, l.amount), 0),
  })).filter((g) => g.amount > 0);

  const visibleLines = activeGroup === "All" ? lines : lines.filter((l) => groupOf(l) === activeGroup);
  const activeGroupMeta = groups.find((g) => g.key === activeGroup);
  const exploredCount = exploredIds.length;

  function toggleCard(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
    setExploredIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  return (
    <section className="card charges-card home-charges" aria-label="What's on your bill">
      <div className="charges-head">
        <div>
          <h3>What's on your bill</h3>
          <span className="muted small">Tap any category or charge card to see where your money goes</span>
        </div>
        <div className="guest-explore-meter" aria-label={`${exploredCount} of ${lines.length} charges inspected`}>
          <span className="guest-explore-label">
            {exploredCount === lines.length ? "All charges inspected" : `${exploredCount} / ${lines.length} inspected`}
          </span>
          <span className="guest-explore-bar" aria-hidden="true">
            <span style={{ width: `${(exploredCount / lines.length) * 100}%` }} />
          </span>
        </div>
      </div>

      <div className="split-bar" role="img" aria-label={groups.map((g) => `${g.label} ${Math.round((g.amount / total) * 100)}%`).join(", ")}>
        {groups.map((g) => (
          <span
            key={g.key}
            className={`seg g-${toneOf(g.key)}${activeGroup !== "All" && activeGroup !== g.key ? " dimmed" : ""}`}
            style={{ width: `${(g.amount / total) * 100}%` }}
          />
        ))}
      </div>

      <div className="guest-filter-pills" role="group" aria-label="Filter charges by recipient">
        <button
          type="button"
          className={`guest-filter-pill${activeGroup === "All" ? " active" : ""}`}
          onClick={() => setActiveGroup("All")}
        >
          <span>All</span>
          <strong>{peso(total)}</strong>
        </button>
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            className={`guest-filter-pill${activeGroup === g.key ? " active" : ""}`}
            onClick={() => setActiveGroup(activeGroup === g.key ? "All" : g.key)}
          >
            <span className={`swatch g-${toneOf(g.key)}`} aria-hidden="true" />
            <span>{g.label}</span>
            <strong>{Math.round((g.amount / total) * 100)}%</strong>
          </button>
        ))}
      </div>

      {activeGroupMeta && (
        <p className="guest-group-note">
          <strong>{activeGroupMeta.label} ({peso(activeGroupMeta.amount)}):</strong> {activeGroupMeta.note}
        </p>
      )}

      <ul className="charge-cards guest-charge-cards" role="list">
        {visibleLines.map((l) => {
          const rank = lines.findIndex((x) => x.id === l.id) + 1;
          const g = GROUPS.find((x) => x.key === groupOf(l))!;
          const tone = toneOf(g.key);
          const share = (Math.max(0, l.amount) / total) * 100;
          const open = selectedId === l.id;
          const explored = exploredIds.includes(l.id);
          const perKwh = kwh ? peso(Math.round(l.amount / kwh)) : null;

          return (
            <li key={l.id}>
              <button
                type="button"
                className={`charge-tile t-${tone}${rank === 1 ? " biggest" : ""}${open ? " expanded" : ""}${explored ? " explored" : ""}`}
                aria-expanded={open}
                onClick={() => toggleCard(l.id)}
              >
                <span className="charge-tile-top">
                  <span className={`charge-tile-icon g-${tone}`} aria-hidden="true">
                    <Icon d={g.icon} size={20} />
                  </span>
                  <span className="guest-tile-badges">
                    {rank === 1 && <span className="guest-rank-pill">Top charge</span>}
                    <span className="pill">{l.goesTo ?? "Other"}</span>
                  </span>
                </span>
                <strong className="charge-tile-amount">{peso(l.amount)}</strong>
                <strong className="charge-tile-name">{l.label}</strong>
                <span className="charge-tile-meter" aria-hidden="true">
                  <span className={`g-${tone}`} style={{ width: `${Math.max(3, share)}%` }} />
                </span>
                <span className="charge-tile-meta">
                  {Math.round(share)}% of bill{perKwh ? ` · ${perKwh}/kWh` : ""}
                </span>
                <span className="guest-charge-what">{l.what}</span>
                {open && (
                  <span className="guest-charge-payee">
                    {l.payee && (
                      <span>
                        <strong>Who gets it:</strong> {l.payee.name}
                      </span>
                    )}
                    {l.printed.length > 0 && (
                      <span className="guest-charge-printed">
                        <strong>Printed on bill as:</strong> {l.printed.join(", ")}
                      </span>
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Guest mode flow:
 * 1. Scan or simulate a Meralco bill
 * 2. Directly display the plain-English bill explanation (no confirmation step, no previous bill comparison, no appliance breakdown)
 */
export function GuestBillFlow({
  onBack,
  onSignIn,
  onSignUp,
}: {
  onBack: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const [explained, setExplained] = useState<GuestBillExplanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  async function onPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const out = await scanGuestBill(file);
      if (out.kind !== "read") {
        setError(out.kind === "unreadable" ? out.problem : out.error);
        return;
      }
      const result = await explainGuestBill(out.now);
      setExplained(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't explain this bill right now.");
    } finally {
      setBusy(false);
    }
  }

  async function onSimulate() {
    setBusy(true);
    setError(null);
    try {
      const out = await simulateGuestBill();
      if (out.kind !== "read") {
        setError(out.kind === "unreadable" ? out.problem : out.error);
        return;
      }
      const result = await explainGuestBill(out.now);
      setExplained(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't explain this bill right now.");
    } finally {
      setBusy(false);
    }
  }

  function resetToScan() {
    setExplained(null);
    setError(null);
  }

  const fileInputs = (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Take a photo of the bill"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPhoto(f);
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        hidden
        aria-label="Upload a bill photo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPhoto(f);
        }}
      />
    </>
  );

  if (explained) {
    const { bill } = explained;
    const billMonth = month(bill.period);
    const metaParts = [
      bill.kwh !== null ? `${bill.kwh} kWh used` : null,
      bill.billingDays !== null ? `${bill.billingDays} billing days` : null,
      bill.dueDate ? `Due ${shortDate(bill.dueDate)}` : null,
    ].filter(Boolean);

    const dailyCost =
      bill.amountDue !== null && bill.billingDays && bill.billingDays > 0
        ? peso(Math.round(bill.amountDue / bill.billingDays))
        : null;
    const dailyKwh =
      bill.kwh !== null && bill.billingDays && bill.billingDays > 0
        ? `${(bill.kwh / bill.billingDays).toFixed(1)} kWh`
        : null;
    const ratePerKwh =
      bill.amountDue !== null && bill.kwh && bill.kwh > 0
        ? peso(Math.round(bill.amountDue / bill.kwh))
        : null;

    const lines = explained.chargeLines.all.filter((l) => l.amount > 0);
    const totalCharges = lines.reduce((s, l) => s + l.amount, 0) || 1;
    const passThroughSum = lines
      .filter((l) => l.goesTo === "Pass-through")
      .reduce((s, l) => s + l.amount, 0);
    const meralcoSum = lines
      .filter((l) => l.goesTo === "Meralco")
      .reduce((s, l) => s + l.amount, 0);
    const passThroughPct = Math.round((passThroughSum / totalCharges) * 100);
    const meralcoPct = Math.round((meralcoSum / totalCharges) * 100);

    return (
      <main className="guest-explain-main">
        <header className="guest-topbar">
          <div className="guest-topbar-left">
            <BackButton onClick={resetToScan} label="Scan another bill" />
            <div className="brand">
              <span className="brand-mark">
                <img src="/icon-192.png" alt="" />
              </span>
              Eelio
            </div>
            <span className="pill">Guest mode</span>
          </div>
          <div className="guest-topbar-actions">
            <span className="guest-topbar-prompt">Want a more detailed explanation?</span>
            <button type="button" className="btn-primary guest-top-btn" onClick={onSignIn}>
              Sign in
            </button>
            <button type="button" className="btn-outline guest-top-btn" onClick={onSignUp}>
              Sign up
            </button>
            <button type="button" className="btn-outline guest-top-btn" onClick={resetToScan}>
              Scan another bill
            </button>
          </div>
        </header>

        <section className="guest-explain-stack" aria-label="Guest bill explanation">
          <div className="hero mood-detective">
            <div className="hero-copy">
              <p className="hero-hello">Bill Detective Summary</p>
              <h2>Your {billMonth} bill</h2>
              <p className="hero-amount" aria-label={bill.amountDue === null ? "Amount not available" : `Amount due ${peso(bill.amountDue)}`}>
                {bill.amountDue === null ? "—" : <CountUpPeso centavos={bill.amountDue} />}
              </p>
              {metaParts.length > 0 && (
                <p className="hero-line">{metaParts.join(" · ")}</p>
              )}
              {lines.length > 0 && (
                <p className="guest-hero-takeaway">
                  {passThroughPct}% goes to power plants and the grid; {meralcoPct}% goes to Meralco.
                </p>
              )}
            </div>
            <img className="hero-mascot" src="/mascot/eelio-detective.png" alt="Eelio, Bill Detective" />
          </div>

          {(dailyCost || dailyKwh || ratePerKwh) && (
            <div className="guest-bite-grid" aria-label="Bill in everyday numbers">
              {dailyCost && (
                <div className="card guest-bite-card">
                  <span className="guest-bite-label">Daily cost</span>
                  <strong className="guest-bite-value">{dailyCost}</strong>
                  <span className="muted small">Average per day this billing period</span>
                </div>
              )}
              {dailyKwh && (
                <div className="card guest-bite-card">
                  <span className="guest-bite-label">Daily usage</span>
                  <strong className="guest-bite-value">{dailyKwh}</strong>
                  <span className="muted small">Electricity used per day</span>
                </div>
              )}
              {ratePerKwh && (
                <div className="card guest-bite-card">
                  <span className="guest-bite-label">Effective rate</span>
                  <strong className="guest-bite-value">{ratePerKwh} / kWh</strong>
                  <span className="muted small">All charges and taxes combined</span>
                </div>
              )}
            </div>
          )}

          <GuestChargesSection data={explained} />
        </section>
      </main>
    );
  }

  return (
    <main className="auth-main">
      <AuthLayout>
        <section className="screen" aria-labelledby="guest-scan-title">
          {fileInputs}
          <div className="screen-head">
            <BackButton onClick={onBack} label="Back" />
            <span className="pill">Guest mode</span>
          </div>
          <div className="screen-intro">
            <h1 id="guest-scan-title">Scan your Meralco bill</h1>
            <p className="lead">
              Take a photo or upload your bill and Eelio will explain every charge on it. No account or linking required.
            </p>
          </div>
          <div className="camera" aria-hidden="true">
            {busy ? (
              <EelioLoader
                compact
                variant="bill"
                badge="Bill Detective"
                title="Reading your bill…"
              />
            ) : (
              <>
                <div className="bill-sketch">
                  <span className="bar accent" />
                  <span className="bar w85" />
                  <span className="bar w70" />
                  <span className="block" />
                  <span className="bar w90" />
                  <span className="bar w80" />
                  <span className="bar w60" />
                  <span className="sketch-foot">
                    <span className="bar w40" />
                    <span className="total" />
                  </span>
                </div>
                <span>Align the whole bill inside the frame</span>
              </>
            )}
          </div>
          {error && (
            <div className="scan-error">
              <p className="error" role="alert">{error}</p>
              <button type="button" className="btn-outline" disabled={busy} onClick={() => void onSimulate()}>
                Continue with simulated bill
              </button>
            </div>
          )}
          <div className="camera-controls">
            <button
              type="button"
              className="square-btn"
              aria-label="Upload from gallery"
              disabled={busy}
              onClick={() => gallery.current?.click()}
            >
              <Icon d={GALLERY} size={22} />
            </button>
            <button
              type="button"
              className="shutter"
              aria-label="Take photo"
              disabled={busy}
              onClick={() => camera.current?.click()}
            >
              <span />
            </button>
            <button
              type="button"
              className="square-btn"
              aria-label="Simulate bill scan"
              title="Simulate bill data"
              disabled={busy}
              onClick={() => void onSimulate()}
            >
              <Icon d={ICON.receipt} size={22} />
            </button>
          </div>
          <div className="simulate-action">
            <button type="button" className="btn-text simulate-btn" disabled={busy} onClick={() => void onSimulate()}>
              <Icon d={ICON.bolt} size={16} /> Simulate bill data
            </button>
          </div>
        </section>
      </AuthLayout>
    </main>
  );
}
