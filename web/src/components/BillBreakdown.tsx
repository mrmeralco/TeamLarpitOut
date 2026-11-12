import { useState } from "react";
import type { BillBreakdown as BillBreakdownData, BillBreakdownRow } from "../api/client";
import { peso } from "../lib/format";

const PAYEE_TAG: Record<string, string> = {
  passThrough: "Pass-through",
  meralco: "Kay Meralco",
  government: "Buwis",
  subsidy: "Subsidy",
};

function change(row: BillBreakdownRow) {
  const c = row.change;
  if (c.status === "noPrevious") return "Walang naka-print na linya ang nakaraang Bill, kaya hindi maikumpara.";
  if (c.status === "new") return "Wala ito sa nakaraang Bill.";
  if (c.amount === 0) return `Walang pagbabago mula sa nakaraang buwan (${peso(c.previous!)}).`;
  return `${peso(c.amount!, true)} kumpara sa nakaraang buwan (${peso(c.previous!)} noon).`;
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
              <span className="muted">Kanino napupunta: </span>
              {row.payee.name}
            </p>
          )}
          <p>
            <span className="muted">Pagbabago: </span>
            {change(row)}
          </p>
        </div>
      )}
    </li>
  );
}

/** "Ano'ng laman ng bill ko?" */
export function BillBreakdown({ data, missingLines }: { data: BillBreakdownData | null; missingLines: boolean }) {
  if (missingLines) {
    return (
      <section className="card">
        <h2>Ano'ng laman ng bill ko?</h2>
        <p className="muted">I-scan o i-type ang mga charge line ng Bill ngayon para makita kung saan napupunta ang bawat piso.</p>
      </section>
    );
  }
  if (!data) return null;
  const share = data.split.passThrough + data.split.meralco;
  return (
    <section className="card" aria-live="polite">
      <h2>Ano'ng laman ng bill ko?</h2>
      {share > 0 && (
        <div className="split">
          <div className="bar two">
            <span className="pass" style={{ width: `${(data.split.passThrough / share) * 100}%` }} />
            <span className="meralco" style={{ width: `${(data.split.meralco / share) * 100}%` }} />
          </div>
          <small>
            <span className="tag passThrough">Pass-through</span> {peso(data.split.passThrough)} ang kinokolekta ng Meralco para sa iba ·{" "}
            <span className="tag meralco">Kay Meralco</span> {peso(data.split.meralco)}
          </small>
        </div>
      )}
      <p className="muted">I-tap ang isang linya para makita kung ano ito.</p>
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
        <span>Kabuuan ng mga linya</span>
        <strong>{peso(data.total)}</strong>
      </div>
    </section>
  );
}
