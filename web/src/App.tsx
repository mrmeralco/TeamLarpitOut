import { useEffect, useRef, useState } from "react";
import { api, lamanApi, scanBill, type BakitGanito, type BillInput, type ChargeLine, type DraftBill, type Laman as LamanData, type ScanOutcome } from "./api";
import { peso } from "./format";
import { Laman } from "./Laman";

const monthLabel = (period: string) =>
  /^\d{4}-\d{2}$/.test(period)
    ? new Date(`${period}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" })
    : period;

const EFFECT_HINT: Record<string, string> = {
  rate: "Nagbago ang singil kada kWh. Hindi mo ito kontrolado.",
  billingDays: "Mas mahaba o maikli ang billing period.",
  weather: "Epekto ng init ng panahon. (Darating pa)",
  habit: "Ang bahaging galing sa sariling gamit ng bahay.",
};

type Slot = "before" | "now";

interface FormBill {
  period: string;
  kwh: string;
  billingDays: string;
  dueDate: string;
  previousReading: string;
  presentReading: string;
  lines: { label: string; amount: string }[];
  /** Fields the scan could not read, or only estimated. */
  missing: string[];
  estimated: string[];
}

const emptyBill = (period = ""): FormBill => ({
  period,
  kwh: "",
  billingDays: "",
  dueDate: "",
  previousReading: "",
  presentReading: "",
  lines: [],
  missing: [],
  estimated: [],
});

const s = (v: number | string | undefined) => (v === undefined ? "" : String(v));

function fromDraft(d: DraftBill, missing: string[] = [], estimated: string[] = []): FormBill {
  return {
    period: s(d.period),
    kwh: s(d.kwh),
    billingDays: s(d.billingDays),
    dueDate: s(d.dueDate),
    previousReading: s(d.previousReading),
    presentReading: s(d.presentReading),
    lines: (d.chargeLines ?? []).map((l) => ({ label: l.label, amount: String(l.amount) })),
    missing,
    estimated,
  };
}

function toInput(b: FormBill): BillInput | null {
  const kwh = Number(b.kwh);
  const billingDays = Number(b.billingDays);
  if (!/^\d{4}-\d{2}$/.test(b.period) || b.kwh === "" || b.billingDays === "") return null;
  if (!Number.isFinite(kwh) || kwh < 0 || !Number.isFinite(billingDays) || billingDays <= 0) return null;
  const chargeLines: ChargeLine[] = b.lines
    .filter((l) => l.label.trim() && l.amount !== "" && Number.isFinite(Number(l.amount)))
    .map((l) => ({ label: l.label.trim(), amount: Number(l.amount) }));
  const opt = (v: string) => (v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  return {
    period: b.period,
    kwh,
    billingDays: Math.round(billingDays),
    chargeLines,
    ...(b.dueDate ? { dueDate: b.dueDate } : {}),
    ...(opt(b.previousReading) !== undefined ? { previousReading: opt(b.previousReading) } : {}),
    ...(opt(b.presentReading) !== undefined ? { presentReading: opt(b.presentReading) } : {}),
  };
}

function ScanButton(props: { label: string; busy: boolean; onPhoto: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) props.onPhoto(f);
        }}
      />
      <button type="button" className="scan" disabled={props.busy} onClick={() => input.current?.click()}>
        {props.busy ? "Binabasa…" : props.label}
      </button>
    </>
  );
}

function Field(props: {
  label: string;
  name: string;
  bill: FormBill;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "decimal" | "numeric" | "text";
  placeholder?: string;
  type?: string;
}) {
  const flag = props.bill.missing.includes(props.name)
    ? "missing"
    : props.bill.estimated.includes(props.name)
      ? "estimated"
      : "";
  return (
    <label className={flag}>
      <span>
        {props.label}
        {flag === "missing" && <em> · hindi nabasa</em>}
        {flag === "estimated" && <em> · tantya, pakitama</em>}
      </span>
      <input
        type={props.type ?? "text"}
        inputMode={props.inputMode}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </label>
  );
}

function BillCard(props: {
  title: string;
  bill: FormBill;
  periods: string[];
  scanning: boolean;
  onScan: (f: File) => void;
  onChange: (b: FormBill) => void;
}) {
  const { bill, onChange } = props;
  const set = (patch: Partial<FormBill>) => onChange({ ...bill, ...patch });
  const setLine = (i: number, patch: Partial<FormBill["lines"][number]>) =>
    set({ lines: bill.lines.map((l, j) => (i === j ? { ...l, ...patch } : l)) });
  const periods = bill.period && !props.periods.includes(bill.period) ? [...props.periods, bill.period] : props.periods;
  const hasReadings = bill.dueDate || bill.previousReading || bill.presentReading;

  return (
    <section className="card">
      <div className="card-head">
        <h2>{props.title}</h2>
        <ScanButton label="📷 I-scan" busy={props.scanning} onPhoto={props.onScan} />
      </div>
      <label className={bill.missing.includes("period") ? "missing" : ""}>
        <span>
          Buwan ng Bill{bill.missing.includes("period") && <em> · hindi nabasa</em>}
        </span>
        <select value={bill.period} onChange={(e) => set({ period: e.target.value })}>
          <option value="">Pumili…</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p)}
              {!props.periods.includes(p) ? " (walang Rate Schedule pa)" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <Field label="kWh na nagamit" name="kwh" bill={bill} value={bill.kwh} onChange={(v) => set({ kwh: v })} inputMode="decimal" placeholder="hal. 220" />
        <Field label="Billing days" name="billingDays" bill={bill} value={bill.billingDays} onChange={(v) => set({ billingDays: v })} inputMode="numeric" placeholder="hal. 30" />
      </div>
      <details open={Boolean(hasReadings)}>
        <summary>Due date at meter readings (opsyonal)</summary>
        <Field label="Due date" name="dueDate" bill={bill} value={bill.dueDate} onChange={(v) => set({ dueDate: v })} type="date" />
        <div className="row">
          <Field label="Previous reading" name="previousReading" bill={bill} value={bill.previousReading} onChange={(v) => set({ previousReading: v })} inputMode="decimal" />
          <Field label="Present reading" name="presentReading" bill={bill} value={bill.presentReading} onChange={(v) => set({ presentReading: v })} inputMode="decimal" />
        </div>
      </details>
      <details open={bill.lines.length > 0}>
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

interface ScanState {
  /** A scan prefilled the forms and the user has not confirmed yet. */
  pending: boolean;
  serviceIdMasked: string | null;
  note: string | null;
  problem: { slot: Slot; text: string; unreadable: boolean } | null;
}

const noScan: ScanState = { pending: false, serviceIdMasked: null, note: null, problem: null };

export function App() {
  const [periods, setPeriods] = useState<string[]>([]);
  const [before, setBefore] = useState<FormBill>(emptyBill());
  const [now, setNow] = useState<FormBill>(emptyBill());
  const [scan, setScan] = useState<ScanState>(noScan);
  const [scanning, setScanning] = useState<Slot | null>(null);
  const [result, setResult] = useState<BakitGanito | null>(null);
  const [laman, setLaman] = useState<LamanData | null>(null);
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

  async function onScan(slot: Slot, photo: File) {
    setScanning(slot);
    setResult(null);
    const out: ScanOutcome = await scanBill(photo);
    setScanning(null);

    if (out.kind !== "read") {
      setScan((st) => ({
        ...st,
        problem: { slot, text: out.kind === "unreadable" ? out.problem : out.error, unreadable: out.kind === "unreadable" },
      }));
      return;
    }

    const set = slot === "now" ? setNow : setBefore;
    set(fromDraft(out.now, out.missing));
    let note: string | null = null;
    if (slot === "now") {
      if (out.before) {
        setBefore(fromDraft(out.before, [], out.estimated.filter((f) => f.startsWith("before.")).map((f) => f.slice(7))));
        note = "Ang nakaraang buwan ay kinuha sa history na naka-print sa Bill. Hindi naka-print ang billing days nito, kaya pakitama.";
      } else {
        note = "Walang history na naka-print. I-scan o i-type ang nakaraang Bill.";
      }
    }
    setScan({ pending: true, serviceIdMasked: out.serviceIdMasked ?? scan.serviceIdMasked, note, problem: null });
  }

  /** Editing a field clears a stale result. */
  const edit = (set: (b: FormBill) => void) => (b: FormBill) => {
    set(b);
    setResult(null);
  };

  const b = toInput(before);
  const n = toInput(now);
  const canDecode = Boolean(b && n) && !scan.pending && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!b || !n || scan.pending) return;
    setBusy(true);
    setError(null);
    try {
      const [r, l] = await Promise.all([
        api.bakitGanito(b, n),
        n.chargeLines.length ? lamanApi(n, b) : Promise.resolve(null),
      ]);
      setResult(r);
      setLaman(l);
    } catch (err) {
      setResult(null);
      setLaman(null);
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

      <section className="card hero-scan">
        <p>Kunan ng litrato ang Bill mo. Babasahin namin, at ikaw ang magkukumpirma.</p>
        <ScanButton label="📷 I-scan ang Bill" busy={scanning === "now"} onPhoto={(f) => onScan("now", f)} />
      </section>

      {scan.problem && (
        <section className="card notice warn" role="alert">
          <p>{scan.problem.text}</p>
          <div className="row">
            {scan.problem.unreadable && (
              <ScanButton label="Kunan ulit" busy={scanning !== null} onPhoto={(f) => onScan(scan.problem!.slot, f)} />
            )}
            <button type="button" className="ghost" onClick={() => setScan((st) => ({ ...st, problem: null }))}>
              I-type na lang
            </button>
          </div>
        </section>
      )}

      {scan.pending && (
        <section className="card notice confirm">
          <h2>Tama ba?</h2>
          <p>Tingnan ang mga nabasa sa ibaba at itama kung kailangan. Walang gagamitin hangga't hindi mo kinukumpirma.</p>
          {scan.serviceIdMasked && (
            <p>
              Service ID Number: <strong>{scan.serviceIdMasked}</strong>
            </p>
          )}
          {scan.note && <p className="muted">{scan.note}</p>}
          <button
            type="button"
            className="primary"
            disabled={!b || !n}
            onClick={() => {
              setScan((st) => ({ ...st, pending: false }));
              setBefore((x) => ({ ...x, missing: [], estimated: [] }));
              setNow((x) => ({ ...x, missing: [], estimated: [] }));
            }}
          >
            Oo, tama
          </button>
          {(!b || !n) && <small className="muted">Punan muna ang kWh, billing days at buwan ng dalawang Bill.</small>}
        </section>
      )}

      <form onSubmit={submit}>
        <BillCard
          title="Nakaraang Bill"
          bill={before}
          periods={periods}
          scanning={scanning === "before"}
          onScan={(f) => onScan("before", f)}
          onChange={edit(setBefore)}
        />
        <BillCard
          title="Bill ngayon"
          bill={now}
          periods={periods}
          scanning={scanning === "now"}
          onScan={(f) => onScan("now", f)}
          onChange={edit(setNow)}
        />
        <button type="submit" className="primary" disabled={!canDecode}>
          {busy ? "Kinukuwenta…" : scan.pending ? "Kumpirmahin muna sa itaas" : "Bakit ganito?"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && <Result r={result} />}
      {result && <Laman data={laman} missingLines={!n?.chargeLines.length} />}
    </main>
  );
}
