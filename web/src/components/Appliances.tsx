import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  appliancesApi,
  rangeFromHours,
  type AirconProposalResult,
  type ApplianceBreakdown,
  type ApplianceInput,
  type CatalogAppliance,
  type Household,
  type TimeRange,
} from "../api/client";
import { monthLabel, peso } from "../lib/format";
import { EelioLoader } from "./EelioLoader";
import { EnergyLabelScan } from "./EnergyLabelScan";
import { AirconPatternProposal } from "./AirconPatternProposal";

const DAYS: { value: TimeRange["days"]; label: string }[] = [
  { value: "everyday", label: "Every day" },
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
  if (def.routine === "timeRanges") {
    // Aircon starts unconfirmed so proposal or routine question must be answered
    a.timeRanges = def.type === "aircon" ? [] : [{ start: "18:00", end: "22:00", days: "everyday" }];
  }
  if (def.routine === "usesPerWeek") a.usesPerWeek = 2;
  return a;
}

function ApplianceCard(props: {
  token: string;
  sin: string;
  onExpired: () => void;
  def: CatalogAppliance;
  value: ApplianceInput;
  household: Household;
  allowPattern: boolean;
  onChange: (a: ApplianceInput) => void;
  onRemove: () => void;
}) {
  const { def, value, household, token, onChange } = props;
  const set = (patch: Partial<ApplianceInput>) => onChange({ ...value, ...patch });
  const ranges = value.timeRanges ?? [];
  const setRange = (i: number, patch: Partial<TimeRange>) =>
    set({ timeRanges: ranges.map((r, j) => (i === j ? { ...r, ...patch } : r)) });

  const isTraditionalAircon = def.type === "aircon" && household.meter_type === "traditional";
  const [proposal, setProposal] = useState<AirconProposalResult | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [manualRoutine, setManualRoutine] = useState(false);
  const [confirmedHours, setConfirmedHours] = useState<number | null>(() => {
    if (ranges.length > 0) {
      const r = ranges[0];
      const m1 = Number(r.start.split(":")[0]) * 60 + Number(r.start.split(":")[1]);
      const m2 = Number(r.end.split(":")[0]) * 60 + Number(r.end.split(":")[1]);
      return Math.round(((m2 - m1 + 1440) % 1440) / 60);
    }
    return null;
  });

  useEffect(() => {
    if (!isTraditionalAircon) return;
    const controller = new AbortController();
    setLoadingProposal(true);
    appliancesApi
      .airconProposal(token, household.sin, value.answers, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setProposal(res);
        if (!res.canPropose) setManualRoutine(true);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) { props.onExpired(); return; }
        setManualRoutine(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingProposal(false); });
    return () => controller.abort();
  }, [isTraditionalAircon, token, household.sin, JSON.stringify(value.answers)]);

  return (
    <li className="appliance">
      <div className="card-head">
        <h3>{def.label}</h3>
        <div className="row qty">
          <label>
            <span>How many</span>
            <input
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              value={value.quantity ?? 1}
              onChange={(e) => set({ quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
            />
          </label>
          <button type="button" className="ghost" aria-label={`Remove ${def.label}`} onClick={props.onRemove}>
            ×
          </button>
        </div>
      </div>

      {(def.type === "aircon" || def.type === "refrigerator") && <EnergyLabelScan
        token={props.token} sin={props.sin} type={def.type} value={value.energyLabel} onExpired={props.onExpired}
        onConfirm={(energyLabel) => set({ energyLabel })} onRemove={() => set({ energyLabel: undefined })}
      />}

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

      {def.routine === "alwaysOn" && <p className="muted">Always on, so there is no question about hours.</p>}

      {def.routine === "timeRanges" && isTraditionalAircon && !manualRoutine && proposal?.canPropose && (
        <div className="proposal-box">
          <p className="proposal-prompt">
            {proposal.prompt ?? `Your aircon seems to run about ${proposal.hours} hours a day. Is that right?`}
          </p>
          {confirmedHours !== null && ranges.length > 0 ? (
            <div className="row proposal-confirmed">
              <span className="muted">Confirmed: {confirmedHours} hours/day</span>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setConfirmedHours(null);
                  set({ timeRanges: [] });
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="row proposal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const h = proposal.hours!;
                  setConfirmedHours(h);
                  set({ timeRanges: [rangeFromHours(h)] });
                }}
              >
                Yes
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const h = Math.min(24, proposal.hours! + 2);
                  setConfirmedHours(h);
                  set({ timeRanges: [rangeFromHours(h)] });
                }}
              >
                Longer
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const h = Math.max(1, proposal.hours! - 2);
                  setConfirmedHours(h);
                  set({ timeRanges: [rangeFromHours(h)] });
                }}
              >
                Shorter
              </button>
            </div>
          )}
          <button
            type="button"
            className="ghost fallback-btn"
            onClick={() => {
              setManualRoutine(true);
              if (ranges.length === 0) set({ timeRanges: [{ start: "18:00", end: "22:00", days: "everyday" }] });
            }}
          >
            Change / enter the routine manually
          </button>
        </div>
      )}

      {def.routine === "timeRanges" && def.type === "aircon" && household.meter_type === "smart" ? (
        <AirconPatternProposal token={token} sin={household.sin} value={value} allowProposal={props.allowPattern}
          onChange={onChange} onExpired={props.onExpired}>
          <RoutineEditor ranges={ranges} setRange={setRange} set={set} />
        </AirconPatternProposal>
      ) : def.routine === "timeRanges" && (!isTraditionalAircon || manualRoutine || !proposal?.canPropose) && (
        <>
          <RoutineEditor ranges={ranges} setRange={setRange} set={set} />
          {isTraditionalAircon && proposal?.canPropose && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setManualRoutine(false);
              }}
            >
              Go back to the Bill History estimate
            </button>
          )}
        </>
      )}

      {def.routine === "usesPerWeek" && (
        <label>
          <span>How many times a week?</span>
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

function RoutineEditor({ ranges, setRange, set }: {
  ranges: TimeRange[];
  setRange: (index: number, patch: Partial<TimeRange>) => void;
  set: (patch: Partial<ApplianceInput>) => void;
}) {
  return <div className="routine">
    <span className="muted">When is it on?</span>
    {ranges.map((range, i) => <div className="row range" key={i}>
      <input type="time" aria-label="Start" value={range.start} onChange={(e) => setRange(i, { start: e.target.value })} />
      <span>to</span>
      <input type="time" aria-label="End" value={range.end} onChange={(e) => setRange(i, { end: e.target.value })} />
      <select aria-label="Days" value={range.days} onChange={(e) => setRange(i, { days: e.target.value as TimeRange["days"] })}>
        {DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
      </select>
      {ranges.length > 1 && <button type="button" className="ghost" aria-label="Remove time"
        onClick={() => set({ timeRanges: ranges.filter((_, j) => j !== i) })}>×</button>}
    </div>)}
    {ranges.length < 6 && <button type="button" className="ghost"
      onClick={() => set({ timeRanges: [...ranges, { start: "06:00", end: "08:00", days: "everyday" }] })}>
      {ranges.length ? "+ Another time" : "Add a time"}
    </button>}
  </div>;
}

function Survey(props: {
  token: string;
  sin: string;
  onExpired: () => void;
  catalog: CatalogAppliance[];
  initial: ApplianceInput[];
  saving: boolean;
  household: Household;
  onSave: (list: ApplianceInput[]) => void;
  onCancel?: () => void;
}) {
  const byType = new Map(props.catalog.map((d) => [d.type, d]));
  const nextId = useRef(0);
  const [list, setList] = useState<{ id: number; value: ApplianceInput }[]>(() =>
    (props.initial.length ? props.initial : STARTER.map((t) => byType.get(t)).filter(Boolean).map((d) => blank(d!)))
      .map((value) => ({ id: nextId.current++, value })),
  );
  const [adding, setAdding] = useState("");

  return (
    <fieldset className="survey-fields" disabled={props.saving}>
      <p className="muted">You only do this once. Answer what you can; "I don't know" is fine.</p>
      <ul className="appliance-list">
        {list.map(({ id, value: a }) => (
          <ApplianceCard
            key={id}
            token={props.token} sin={props.sin} onExpired={props.onExpired}
            def={byType.get(a.type)!}
            value={a}
            household={props.household}
            allowPattern={list.filter((entry) => entry.value.type === "aircon").length === 1}
            onChange={(next) => setList((current) => current.map((x) => x.id === id ? { ...x, value: next } : x))}
            onRemove={() => setList((current) => current.filter((x) => x.id !== id))}
          />
        ))}
      </ul>
      <div className="row">
        <select aria-label="Add an appliance" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Add an appliance…</option>
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
            const entry = { id: nextId.current++, value: blank(byType.get(adding)!) };
            setList((current) => [...current, entry]);
            setAdding("");
          }}
        >
          Add
        </button>
      </div>
      <button type="button" className="primary" disabled={props.saving || list.length === 0
        || list.some(({ value }) => value.type === "aircon" && !value.timeRanges?.length)} onClick={() => props.onSave(list.map((a) => a.value))}>
        {props.saving ? "Saving…" : "Save and see where it goes"}
      </button>
      {props.onCancel && (
        <button type="button" className="ghost wide" onClick={props.onCancel}>
          Cancel changes
        </button>
      )}
    </fieldset>
  );
}

function Breakdown({ data, onEdit }: { data: ApplianceBreakdown; onEdit: () => void }) {
  const max = Math.max(...data.rows.map((r) => r.kwh), 0.01);
  return (
    <>
      <p className="muted">
        {monthLabel(data.bill.period)} Bill: {data.bill.kwh} kWh. The estimates are adjusted so the total matches the Bill's kWh.
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
        <span>Total ({data.totals.kwh} kWh)</span>
        <strong>{peso(data.totals.perKwhCharges)}</strong>
      </div>
      <small className="muted">
        Not including {peso(data.totals.fixedCharges)} in fixed charges: these are charged every month however little you use.
      </small>
      <button type="button" className="ghost wide" onClick={onEdit}>
        Change the appliances
      </button>
    </>
  );
}

/** Appliances (asked once per Household) and "Where does it go?". Parent keys it by session and SIN. */
type AppliancesProps = {
  token: string; household: Household; onExpired: () => void; onSaved?: () => void;
};

export function Appliances(props: AppliancesProps) {
  return <HouseholdAppliances key={`${props.token}:${props.household.sin}`} {...props} />;
}

function HouseholdAppliances({ token, household, onExpired, onSaved }: AppliancesProps) {
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
      if (!signal?.aborted) fail(err, "Couldn't work out where the electricity goes.");
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
        if (controller.signal.aborted) return;
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
        if (!controller.signal.aborted) fail(err, "Couldn't get the appliances.");
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
      fail(err, "Couldn't save the appliances.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card appliances" aria-live="polite">
      <h2>{editing ? "Appliances at home" : "Where does it go?"}</h2>
      {error && <p className="error">{error}</p>}
      {!catalog || saved === null ? (
        !error && (
          <EelioLoader
            compact
            variant="appliances"
            badge="Appliance Check"
            title="Loading…"
            progress={36}
            activeStep={0}
          />
        )
      ) : editing ? (
        <Survey
          token={token} sin={household.sin} onExpired={onExpired}
          catalog={catalog}
          initial={saved}
          saving={saving}
          household={household}
          onSave={save}
          onCancel={saved.length ? () => setEditing(false) : undefined}
        />
      ) : breakdown ? (
        <Breakdown data={breakdown} onEdit={() => setEditing(true)} />
      ) : (
        !error && (
          <EelioLoader
            compact
            variant="appliances"
            badge="Where Does It Go?"
            title="Calculating…"
            progress={76}
            activeStep={2}
          />
        )
      )}
    </section>
  );
}
