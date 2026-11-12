import { useEffect, useState } from "react";
import { api, type BakitGanito, type BillInput, type ChargeLine } from "./api";

const peso = (centavos: number, signed = false) => {
  const s = (Math.abs(centavos) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = centavos < 0 ? "−" : signed && centavos > 0 ? "+" : "";
  return `${sign}₱${s}`;
};

const monthLabel = (period: string) =>
  new Date(`${period}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });

const EFFECT_HINT: Record<string, string> = {
  rate: "Nagbago ang singil kada kWh. Hindi mo ito kontrolado.",
  billingDays: "Mas mahaba o maikli ang billing period.",
  weather: "Epekto ng init ng panahon. (Darating pa)",
  habit: "Ang bahaging galing sa sariling gamit ng bahay.",
};

interface FormBill {
  period: string;
  kwh: string;
  billingDays: string;
  lines: { label: string; amount: string }[];
}

const emptyBill = (period = ""): FormBill => ({ period, kwh: "", billingDays: "", lines: [] });

function toInput(b: FormBill): BillInput | null {
  const kwh = Number(b.kwh);
  const billingDays = Number(b.billingDays);
  if (!b.period || !b.kwh || !b.billingDays || kwh < 0 || billingDays <= 0) return null;
  const chargeLines: ChargeLine[] = b.lines
    .filter((l) => l.label.trim() && l.amount !== "")
    .map((l) => ({ label: l.label.trim(), amount: Number(l.amount) }));
  return { period: b.period, kwh, billingDays: Math.round(billingDays), chargeLines };
}

function BillCard(props: { title: string; bill: FormBill; periods: string[]; onChange: (b: FormBill) => void }) {
  const { bill, onChange } = props;
  const set = (patch: Partial<FormBill>) => onChange({ ...bill, ...patch });
  const setLine = (i: number, patch: Partial<FormBill["lines"][number]>) =>
    set({ lines: bill.lines.map((l, j) => (i === j ? { ...l, ...patch } : l)) });

  return (
    <section className="card">
      <h2>{props.title}</h2>
      <label>
        Buwan ng Bill
        <select value={bill.period} onChange={(e) => set({ period: e.target.value })}>
          <option value="">Pumili…</option>
          {props.periods.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          kWh na nagamit
          <input inputMode="decimal" value={bill.kwh} onChange={(e) => set({ kwh: e.target.value })} placeholder="hal. 220" />
        </label>
        <label>
          Billing days
          <input inputMode="numeric" value={bill.billingDays} onChange={(e) => set({ billingDays: e.target.value })} placeholder="hal. 30" />
        </label>
      </div>
      <details>
        <summary>Mga charge line (opsyonal)</summary>
        {bill.lines.map((l, i) => (
          <div className="row line" key={i}>
            <input value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} placeholder="Generation Charge" />
            <input inputMode="decimal" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} placeholder="₱" />
            <button type="button" className="ghost" aria-label="Alisin" onClick={() => set({ lines: bill.lines.filter((_, j) => j !== i) })}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => set({ lines: [...bill.lines, { label: "", amount: "" }] })}>
          + Magdagdag ng linya
        </button>
      </details>
    </section>
  );
}

function Result({ r }: { r: BakitGanito }) {
  const max = Math.max(...r.effects.map((e) => Math.abs(e.amount)), 1);
  const matches = r.printedChange === null || r.printedChange === r.total;
  return (
    <section className="card result" aria-live="polite">
      <h2>Bakit ganito?</h2>
      <p className="lede">
        {monthLabel(r.before.period)} {peso(r.before.rebuiltTotal)} → {monthLabel(r.now.period)} {peso(r.now.rebuiltTotal)}
      </p>
      <ul className="effects">
        {r.effects.map((e) => (
          <li key={e.key}>
            <div className="effect-head">
              <span>{e.label}</span>
              <strong className={e.amount < 0 ? "down" : e.amount > 0 ? "up" : ""}>{peso(e.amount, true)}</strong>
            </div>
            <div className="bar">
              <span className={e.amount < 0 ? "down" : "up"} style={{ width: `${(Math.abs(e.amount) / max) * 100}%` }} />
            </div>
            <small>{EFFECT_HINT[e.key]}</small>
          </li>
        ))}
        <li className="total">
          <div className="effect-head">
            <span>Kabuuang pagbabago</span>
            <strong>{peso(r.total, true)}</strong>
          </div>
          <small>
            {matches ? "✓ Tugma sa totoong pagbabago ng Bill" : `Ang naka-print na pagbabago ay ${peso(r.printedChange!, true)}.`}
          </small>
        </li>
      </ul>
    </section>
  );
}

export function App() {
  const [periods, setPeriods] = useState<string[]>([]);
  const [before, setBefore] = useState<FormBill>(emptyBill());
  const [now, setNow] = useState<FormBill>(emptyBill());
  const [result, setResult] = useState<BakitGanito | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .periods()
      .then(({ periods }) => {
        setPeriods(periods);
        setBefore((b) => ({ ...b, period: b.period || periods.at(-2) || "" }));
        setNow((b) => ({ ...b, period: b.period || periods.at(-1) || "" }));
      })
      .catch(() => setError("Hindi maabot ang server."));
  }, []);

  const b = toInput(before);
  const n = toInput(now);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!b || !n) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.bakitGanito(b, n));
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <h1>KuryenteKo</h1>
        <p>Bakit ganito ang bill ko?</p>
      </header>
      <form onSubmit={submit}>
        <BillCard title="Nakaraang Bill" bill={before} periods={periods} onChange={setBefore} />
        <BillCard title="Bill ngayon" bill={now} periods={periods} onChange={setNow} />
        <button type="submit" className="primary" disabled={!b || !n || busy}>
          {busy ? "Kinukuwenta…" : "Bakit ganito?"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && <Result r={result} />}
    </main>
  );
}
