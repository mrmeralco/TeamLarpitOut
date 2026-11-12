import { useState } from "react";
import type { BillChecksResult, SingleCheckResult } from "../api/client";

export function BillChecks({ data }: { data: BillChecksResult | null }) {
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const isGreen = data.overall === "green";

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

  return (
    <section className="card bill-checks" aria-live="polite">
      <div className="card-head">
        <h2>Tama ba ito? · Bill Checks</h2>
        <span className={`status-badge ${isGreen ? "green" : "red"}`}>
          {isGreen ? "✓ Green" : "⚠ Red"}
        </span>
      </div>

      <div className={`notice checks-banner ${isGreen ? "banner-green" : "banner-red"}`}>
        {isGreen ? (
          <p>
            <strong>✓ Tugma ang mga numero ng Meralco.</strong> Lahat ng nasuring opisyal na figures ay nagtutugma.
          </p>
        ) : (
          <p>
            <strong>⚠ May nakitang discrepancy sa Meralco figures.</strong> May mga numerong hindi nagtutugma sa sariling figures ng bill.
          </p>
        )}
      </div>

      <ul className="checks-list">
        {data.checks.map((check) => (
          <CheckRow key={check.key} check={check} />
        ))}
      </ul>

      {!isGreen && (
        <div className="itanong-section">
          <h3>Itanong kay Meralco</h3>
          <p className="muted">
            Maaari mong kopyahin ang buod sa ibaba upang maipakita o maitawag sa Meralco Customer Care (16211).
          </p>
          <pre className="summary-pre">{data.summary}</pre>
          <button type="button" className="primary copy-btn" onClick={onCopy}>
            {copied ? "✓ Nakopya na sa clipboard!" : "📋 Kopyahin ang Buod"}
          </button>
          <small className="muted adr-note">
            Paalala (ADR-0002): Walang automatic na ticket o reklamo na ipinapadala ang app. Gabay lamang ito para sa iyong sariling pagtatanong.
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
