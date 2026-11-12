import { useEffect, useState } from "react";
import {
  ApiError,
  appliancesApi,
  type ApplianceBreakdown,
  type ApplianceInput,
  type CatalogAppliance,
  type Household,
  type TimeRange,
} from "../api/client";
import { monthLabel, peso } from "../lib/format";

const DAYS: { value: TimeRange["days"]; label: string }[] = [
  { value: "everyday", label: "Araw-araw" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekends", label: "Weekends" },
];

/** A starting list so most households only adjust, not type from scratch. */
const STARTER = ["refrigerator", "wifi", "lights", "electric_fan"];

function blank(def: CatalogAppliance): ApplianceInput {
  const a: ApplianceInput = {
    type: def.type,
    quantity: 1,
    answers: Object.fromEntries(def.questions.map((q) => [q.key, "unknown"])),
  };
  if (def.routine === "timeRanges") a.timeRanges = [{ start: "18:00", end: "22:00", days: "everyday" }];
  if (def.routine === "usesPerWeek") a.usesPerWeek = 2;
  return a;
}

function ApplianceCard(props: {
  def: CatalogAppliance;
  value: ApplianceInput;
  onChange: (a: ApplianceInput) => void;
  onRemove: () => void;
}) {
  const { def, value, onChange } = props;
  const set = (patch: Partial<ApplianceInput>) => onChange({ ...value, ...patch });
  const ranges = value.timeRanges ?? [];
  const setRange = (i: number, patch: Partial<TimeRange>) =>
    set({ timeRanges: ranges.map((r, j) => (i === j ? { ...r, ...patch } : r)) });

  return (
    <li className="appliance">
      <div className="card-head">
        <h3>{def.label}</h3>
        <div className="row qty">
          <label>
            <span>Ilan</span>
            <input
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              value={value.quantity ?? 1}
              onChange={(e) => set({ quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
            />
          </label>
          <button type="button" className="ghost" aria-label={`Alisin ang ${def.label}`} onClick={props.onRemove}>
            ×
          </button>
        </div>
      </div>

      {def.questions.map((q) => (
        <label key={q.key}>
          <span>{q.label}</span>
          <select value={value.answers?.[q.key] ?? "unknown"} onChange={(e) => set({ answers: { ...value.answers, [q.key]: e.target.value } })}>
            {q.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      {def.routine === "alwaysOn" && <p className="muted">Laging bukas, kaya walang tanong sa oras.</p>}

      {def.routine === "timeRanges" && (
        <div className="routine">
          <span className="muted">Kailan bukas?</span>
          {ranges.map((r, i) => (
            <div className="row range" key={i}>
              <input type="time" aria-label="Simula" value={r.start} onChange={(e) => setRange(i, { start: e.target.value })} />
              <span>hanggang</span>
              <input type="time" aria-label="Tapos" value={r.end} onChange={(e) => setRange(i, { end: e.target.value })} />
              <select aria-label="Mga araw" value={r.days} onChange={(e) => setRange(i, { days: e.target.value as TimeRange["days"] })}>
                {DAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              {ranges.length > 1 && (
                <button type="button" className="ghost" aria-label="Alisin ang oras" onClick={() => set({ timeRanges: ranges.filter((_, j) => j !== i) })}>
                  ×
                </button>
              )}
            </div>
          ))}
          {ranges.length < 6 && (
            <button type="button" className="ghost" onClick={() => set({ timeRanges: [...ranges, { start: "06:00", end: "08:00", days: "everyday" }] })}>
              + Isa pang oras
            </button>
          )}
        </div>
      )}

      {def.routine === "usesPerWeek" && (
        <label>
          <span>Ilang beses kada linggo?</span>
          <input
            type="number"
            min={0}
            max={50}
            inputMode="numeric"
            value={value.usesPerWeek ?? 0}
            onChange={(e) => set({ usesPerWeek: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
          />
        </label>
      )}
    </li>
  );
}

function Survey(props: {
  catalog: CatalogAppliance[];
  initial: ApplianceInput[];
  saving: boolean;
  onSave: (list: ApplianceInput[]) => void;
  onCancel?: () => void;
}) {
  const byType = new Map(props.catalog.map((d) => [d.type, d]));
  const [list, setList] = useState<ApplianceInput[]>(() =>
    props.initial.length ? props.initial : STARTER.map((t) => byType.get(t)).filter(Boolean).map((d) => blank(d!)),
  );
  const [adding, setAdding] = useState("");

  return (
    <>
      <p className="muted">Isang beses lang ito. Sagutin ang kaya mo; "Hindi ko alam" ay ayos lang.</p>
      <ul className="appliance-list">
        {list.map((a, i) => (
          <ApplianceCard
            key={i}
            def={byType.get(a.type)!}
            value={a}
            onChange={(next) => setList(list.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setList(list.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      <div className="row">
        <select aria-label="Magdagdag ng appliance" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Magdagdag ng appliance…</option>
          {props.catalog.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ghost"
          disabled={!adding}
          onClick={() => {
            setList([...list, blank(byType.get(adding)!)]);
            setAdding("");
          }}
        >
          Idagdag
        </button>
      </div>
      <button type="button" className="primary" disabled={props.saving || list.length === 0} onClick={() => props.onSave(list)}>
        {props.saving ? "Sine-save…" : "I-save at tingnan kung saan napupunta"}
      </button>
      {props.onCancel && (
        <button type="button" className="ghost wide" onClick={props.onCancel}>
          Huwag na lang baguhin
        </button>
      )}
    </>
  );
}

function Breakdown({ data, onEdit }: { data: ApplianceBreakdown; onEdit: () => void }) {
  const max = Math.max(...data.rows.map((r) => r.kwh), 0.01);
  return (
    <>
      <p className="muted">
        Bill ng {monthLabel(data.bill.period)}: {data.bill.kwh} kWh. Inayos ang tantya para tumugma ang kabuuan sa kWh ng Bill.
      </p>
      <ul className="usage">
        {data.rows.map((r) => (
          <li key={r.index}>
            <div className="effect-head">
              <span>
                {r.label}
                {r.quantity > 1 ? ` ×${r.quantity}` : ""}
                <span className={`tag source-${r.source}`}>{r.sourceLabel}</span>
              </span>
              <strong>{peso(r.pesos)}</strong>
            </div>
            <div className="bar">
              <span className="usage-bar" style={{ width: `${(r.kwh / max) * 100}%` }} />
            </div>
            <small className="muted">
              {r.kwh} kWh · {Math.round(r.share * 100)}%
            </small>
          </li>
        ))}
      </ul>
      <div className="effect-head usage-total">
        <span>Kabuuan ({data.totals.kwh} kWh)</span>
        <strong>{peso(data.totals.perKwhCharges)}</strong>
      </div>
      <small className="muted">
        Hindi kasama ang {peso(data.totals.fixedCharges)} na Fixed Charges: sinisingil ito kada buwan kahit gaano kakonti ang gamit.
      </small>
      <button type="button" className="ghost wide" onClick={onEdit}>
        Baguhin ang mga appliance
      </button>
    </>
  );
}

/** Appliances (asked once per Household) and "Saan napupunta?". Parent keys it by session and SIN. */
export function Appliances({ token, household, onExpired, onSaved }: {
  token: string; household: Household; onExpired: () => void; onSaved?: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogAppliance[] | null>(null);
  const [saved, setSaved] = useState<ApplianceInput[] | null>(null);
  const [breakdown, setBreakdown] = useState<ApplianceBreakdown | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) onExpired();
    else setError(err instanceof Error ? err.message : fallback);
  };

  async function loadBreakdown(signal?: AbortSignal) {
    try {
      setBreakdown(await appliancesApi.breakdown(token, household.sin, signal));
    } catch (err) {
      if (!signal?.aborted) fail(err, "Hindi makuha kung saan napupunta ang kuryente.");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [cat, mine] = await Promise.all([
          appliancesApi.catalog(controller.signal),
          appliancesApi.list(token, household.sin, controller.signal),
        ]);
        setCatalog(cat.appliances);
        if (mine.saved) {
          setSaved(mine.appliances.map(({ type, quantity, answers, timeRanges, usesPerWeek, energyLabel }) => ({
            type, quantity, answers, timeRanges, usesPerWeek,
            ...(energyLabel ? { energyLabel: {
              consumptionKwh: energyLabel.consumptionKwh,
              period: energyLabel.period,
              referenceDays: energyLabel.referenceDays,
              referenceHoursPerDay: energyLabel.referenceHoursPerDay,
              confirmed: energyLabel.confirmed,
            } } : {}),
          })));
          await loadBreakdown(controller.signal);
        } else {
          setSaved([]);
          setEditing(true);
        }
      } catch (err) {
        if (!controller.signal.aborted) fail(err, "Hindi makuha ang mga appliance.");
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, household.sin]);

  async function save(list: ApplianceInput[]) {
    setSaving(true);
    setError(null);
    try {
      await appliancesApi.save(token, household.sin, list);
      setSaved(list);
      setEditing(false);
      onSaved?.();
      setBreakdown(null);
      await loadBreakdown();
    } catch (err) {
      fail(err, "Hindi na-save ang mga appliance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card appliances" aria-live="polite">
      <h2>{editing ? "Mga appliance sa bahay" : "Saan napupunta?"}</h2>
      {error && <p className="error">{error}</p>}
      {!catalog || saved === null ? (
        !error && <p className="muted">Kinukuha…</p>
      ) : editing ? (
        <Survey
          catalog={catalog}
          initial={saved}
          saving={saving}
          onSave={save}
          onCancel={saved.length ? () => setEditing(false) : undefined}
        />
      ) : breakdown ? (
        <Breakdown data={breakdown} onEdit={() => setEditing(true)} />
      ) : (
        !error && <p className="muted">Kinukuwenta…</p>
      )}
    </section>
  );
}
