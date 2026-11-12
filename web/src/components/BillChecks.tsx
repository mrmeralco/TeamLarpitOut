import { useState } from "react";
import type { BillChecksResult, SingleCheckResult } from "../api/client";

interface BillChecksProps {
  data: BillChecksResult | null;
  onReportChange?: (reason: string) => void | Promise<void>;
  onNavigateMissions?: () => void;
}

const HOUSEHOLD_CHANGE_OPTIONS = [
  "We had guests",
  "New appliance",
  "Someone was home more",
  "Other",
];

export function BillChecks({ data, onReportChange, onNavigateMissions }: BillChecksProps) {
  const [copied, setCopied] = useState(false);
  const [selectedChange, setSelectedChange] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!data) return null;

  const isGreen = data.overall === "green";
  const isYellow = data.overall === "yellow";
  const isRed = data.overall === "red";

  const onCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.summary);
      } else {
        throw new Error("No clipboard API");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = data.summary;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleSelectChange = async (reason: string) => {
    setSelectedChange(reason);
    if (onReportChange) {
      setSubmitting(true);
      try {
        await onReportChange(reason);
        setReported(true);
      } finally {
        setSubmitting(false);
      }
    } else {
      setReported(true);
    }
  };

  return (
    <section className="card bill-checks" aria-live="polite">
      <div className="card-head">
        <h2>Is it right? · Bill Checks</h2>
        <span
          className={`status-badge ${
            isGreen ? "green" : isYellow ? "yellow" : "red"
          }`}
        >
          {isGreen
            ? "✓ Bill verified"
            : isYellow
            ? "🟡 Higher than usual"
            : "⚠ Something doesn't match"}
        </span>
      </div>

      <div
        className={`notice checks-banner ${
          isGreen
            ? "banner-green"
            : isYellow
            ? "banner-yellow"
            : "banner-red"
        }`}
      >
        {isGreen ? (
          <p>
            <strong>✓ Meralco's figures match.</strong> Every official figure checked agrees.
          </p>
        ) : isYellow ? (
          <p>
            <strong>🟡 Higher than usual.</strong> More than your usual use for this weather, but all of Meralco's checks match.
          </p>
        ) : (
          <p>
            <strong>⚠ Meralco's figures don't match.</strong> Some numbers disagree with the bill's own figures.
          </p>
        )}
      </div>

      <ul className="checks-list">
        {data.checks.map((check) => (
          <CheckRow key={check.key} check={check} />
        ))}
      </ul>

      {isYellow && (
        <div className="household-change-section" aria-labelledby="household-change-heading">
          <h3 id="household-change-heading">Did something change at home?</h3>
          <p className="muted">
            Higher use can come from guests, a new appliance or a change in routine. It is not a problem with Meralco's bill.
          </p>

          {!reported ? (
            <div className="change-options" role="group" aria-label="Possible reasons for the change in usage">
              {HOUSEHOLD_CHANGE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`change-opt-btn ${selectedChange === opt ? "selected" : ""}`}
                  disabled={submitting}
                  onClick={() => handleSelectChange(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div className="notice banner-green change-confirmed">
              <p>
                <strong>✓ Reason saved ({selectedChange}).</strong> We'll use it to fit your saving suggestions.
              </p>
              <button
                type="button"
                className="primary missions-btn"
                onClick={onNavigateMissions}
              >
                See Missions (What should I do?) →
              </button>
            </div>
          )}
        </div>
      )}

      {isRed && (
        <div className="itanong-section">
          <h3>Ask Meralco</h3>
          <p className="muted">
            Copy the summary below to show or read to Meralco Customer Care (16211).
          </p>
          <pre className="summary-pre">{data.summary}</pre>
          <button type="button" className="primary copy-btn" onClick={onCopy}>
            {copied ? "✓ Copied to clipboard!" : "📋 Copy summary"}
          </button>
          <small className="muted adr-note">
            Note (ADR-0002): the app never sends a ticket or complaint. This is only a guide for your own question.
          </small>
        </div>
      )}
    </section>
  );
}

function CheckRow({ check }: { check: SingleCheckResult }) {
  const icon =
    check.status === "pass" ? "✓" : check.status === "fail" ? "⚠" : "—";
  const badgeClass =
    check.status === "pass"
      ? "check-pass"
      : check.status === "fail"
      ? "check-fail"
      : "check-skipped";

  return (
    <li className={`check-item ${badgeClass}`}>
      <div className="check-head">
        <span className="check-title">
          <strong className="check-icon">{icon}</strong> {check.title}
        </span>
        <span className={`tag ${badgeClass}`}>{check.status.toUpperCase()}</span>
      </div>
      <p className="check-message">{check.message}</p>
      {check.discrepancy && (
        <div className="discrepancy-card">
          <div className="discrepancy-col">
            <span className="muted">{check.discrepancy.labelA}</span>
            <strong className="discrepancy-val">{check.discrepancy.valueA}</strong>
          </div>
          <div className="discrepancy-vs">vs</div>
          <div className="discrepancy-col">
            <span className="muted">{check.discrepancy.labelB}</span>
            <strong className="discrepancy-val">{check.discrepancy.valueB}</strong>
          </div>
        </div>
      )}
    </li>
  );
}
