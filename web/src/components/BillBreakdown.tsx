import { useState } from "react";
import type { BillBreakdown as BillBreakdownData, BillBreakdownRow } from "../api/client";
import { peso } from "../lib/format";

const PAYEE_TAG: Record<string, string> = {
  passThrough: "Pass-through",
  meralco: "Meralco",
  government: "Tax",
  subsidy: "Subsidy",
};

function change(row: BillBreakdownRow) {
  const c = row.change;
  if (c.status === "noPrevious") return "Last month's Bill has no printed lines, so it can't be compared.";
  if (c.status === "new") return "This wasn't on last month's Bill.";
  if (c.amount === 0) return `No change from last month (${peso(c.previous!)}).`;
  return `${peso(c.amount!, true)} compared with last month (${peso(c.previous!)} then).`;
}

function Row({ row }: { row: BillBreakdownRow }) {
  const [open, setOpen] = useState(false);
  const tag = row.payee ? PAYEE_TAG[row.payee.type] : null;
  return (
    <li className={`laman-row ${row.known ? "" : "unknown"}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="laman-label">
          {row.label}
          {tag && <span className={`tag ${row.payee!.type}`}>{tag}</span>}
        </span>
        <strong>{peso(row.amount)}</strong>
      </button>
      {open && (
        <div className="laman-detail">
          <p>{row.what}</p>
          {row.payee && (
            <p>
              <span className="muted">Who gets it: </span>
              {row.payee.name}
            </p>
          )}
          <p>
            <span className="muted">Change: </span>
            {change(row)}
          </p>
        </div>
      )}
    </li>
  );
}

/** "What's on my bill?" */
export function BillBreakdown({ data, missingLines }: { data: BillBreakdownData | null; missingLines: boolean }) {
  if (missingLines) {
    return (
      <section className="card">
        <h2>What's on my bill?</h2>
        <p className="muted">Scan or type this Bill's charge lines to see where every peso goes.</p>
      </section>
    );
  }
  if (!data) return null;
  const share = data.split.passThrough + data.split.meralco;
  return (
    <section className="card" aria-live="polite">
      <h2>What's on my bill?</h2>
      {share > 0 && (
        <div className="split">
          <div className="bar two">
            <span className="pass" style={{ width: `${(data.split.passThrough / share) * 100}%` }} />
            <span className="meralco" style={{ width: `${(data.split.meralco / share) * 100}%` }} />
          </div>
          <small>
            <span className="tag passThrough">Pass-through</span> {peso(data.split.passThrough)} collected by Meralco for others ·{" "}
            <span className="tag meralco">Meralco</span> {peso(data.split.meralco)}
          </small>
        </div>
      )}
      <p className="muted">Tap a line to see what it is.</p>
      {data.groups.map((g) => (
        <div key={g.key} className="laman-group">
          <div className="effect-head">
            <h3>{g.title}</h3>
            <span className="muted">{peso(g.total)}</span>
          </div>
          <ul>
            {g.rows.map((r, i) => (
              <Row key={`${r.label}-${i}`} row={r} />
            ))}
          </ul>
        </div>
      ))}
      <div className="effect-head laman-total">
        <span>Total of the lines</span>
        <strong>{peso(data.total)}</strong>
      </div>
    </section>
  );
}
