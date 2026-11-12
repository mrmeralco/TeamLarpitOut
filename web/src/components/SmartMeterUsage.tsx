import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type Household, type ReadingInterval, type ReadingRange, type UsageReadings } from "../api/client";
import { maskSin } from "../lib/format";

type Reading = UsageReadings["readings"][number];

const kwh = (value: number) => value.toLocaleString("en-PH", { maximumFractionDigits: 3 });
const fmt = (timeZone: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-PH", { timeZone, ...options });
const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
/** Ranges are end-exclusive; the last instant inside one names its last day. */
const lastInstant = (to: string) => new Date(new Date(to).getTime() - 1);

const views: Record<ReadingInterval, { label: string; title: string; window: string; period: string }> = {
  hour: { label: "Hour", title: "Hourly", window: "last 24 hours available", period: "hour" },
  day: { label: "Day", title: "Daily", window: "last 30 days available", period: "day" },
  week: { label: "Week", title: "Weekly", window: "last 12 weeks available", period: "week" },
};

/** One bar's period in Manila time: "Nov 2, 2026, 12:00 AM – 1:00 AM", "Mon, Nov 2, 2026" or "Nov 2 – Nov 8, 2026". */
function periodOf(row: ReadingRange, interval: ReadingInterval, timeZone: string): string {
  const from = new Date(row.from);
  if (interval === "hour") return `${fmt(timeZone, DAY).format(from)}, ${fmt(timeZone, TIME).format(from)} – ${fmt(timeZone, TIME).format(new Date(row.to))}`;
  if (interval === "day") return fmt(timeZone, { weekday: "short", ...DAY }).format(from);
  return `${fmt(timeZone, { month: "short", day: "numeric" }).format(from)} – ${fmt(timeZone, DAY).format(lastInstant(row.to))}`;
}

/** A shown or simulated window, with times only when it is shorter than a few days. */
function spanOf(range: ReadingRange, timeZone: string): string {
  const short = new Date(range.to).getTime() - new Date(range.from).getTime() <= 2 * 86_400_000;
  const f = fmt(timeZone, short ? { ...DAY, ...TIME } : DAY);
  return `${f.format(new Date(range.from))} – ${f.format(short ? new Date(range.to) : lastInstant(range.to))}`;
}

const coverage = (row: Reading) => (row.partial ? "Partial: some hours missing" : "Complete");

/**
 * Bars in kWh, drawn like the 12-Bill usage card so both fill the same space. Each bar shows its
 * exact value in a tooltip on hover, tap or keyboard focus; the chart is one tab stop, the arrow
 * keys (Home/End) move between bars and Esc hides the tooltip.
 */
function UsageChart({ data }: { data: UsageReadings }) {
  const [active, setActive] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const chart = useRef<HTMLDivElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const rows = data.readings;
  const max = Math.max(...rows.map((row) => row.kwh)) || 1;
  const avg = rows.reduce((sum, row) => sum + row.kwh, 0) / rows.length;
  const labels = fmt(data.timeZone, data.interval === "hour" ? { hour: "numeric" } : { month: "short", day: "numeric" });
  const labelEvery = Math.max(1, Math.ceil(rows.length / 4));

  const show = (i: number, focus = false) => {
    setActive(i); setCursor(i);
    if (focus) bars.current[i]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = rows.length - 1;
    const next = { ArrowRight: cursor + 1, ArrowUp: cursor + 1, ArrowLeft: cursor - 1, ArrowDown: cursor - 1, Home: 0, End: last }[event.key];
    if (next !== undefined) { event.preventDefault(); show(Math.min(last, Math.max(0, next)), true); }
    else if (event.key === "Escape") setActive(null);
  };
  /** Leaving with the mouse keeps a keyboard-focused bar's tooltip. */
  const hideUnlessFocused = () => { if (!chart.current?.contains(document.activeElement)) setActive(null); };

  return <div ref={chart} className="bars meter-bars" role="group" onKeyDown={onKeyDown} onMouseLeave={hideUnlessFocused}
    aria-label={`${views[data.interval].title} usage chart in kWh${data.interval === "week" ? ", weeks start Monday" : ""}. Hover, tap or use the arrow keys on a bar for its exact value.`}>
    <span className="bars-avg" style={{ bottom: `calc(22px + (100% - 44px) * ${avg / max})` }} aria-hidden="true"><span>avg {kwh(Math.round(avg * 10) / 10)}</span></span>
    {rows.map((row, i) => {
      const height = Math.max(2, (row.kwh / max) * 100);
      const edge = (i + 0.5) / rows.length * 100;
      return <span key={row.from} ref={(el) => { bars.current[i] = el; }} role="img" tabIndex={i === cursor ? 0 : -1}
        aria-label={`${periodOf(row, data.interval, data.timeZone)}: ${kwh(row.kwh)} kWh, ${coverage(row).toLowerCase()}`}
        className={`bar-col${row.partial ? " partial" : ""}${active === i ? " active" : ""}`}
        onMouseEnter={() => show(i)} onClick={() => show(i)} onFocus={() => show(i)}
        onBlur={(event) => { if (!chart.current?.contains(event.relatedTarget as Node | null)) setActive(null); }}>
        <span className="ubar meter-usage-bar" style={{ height: `${height}%`, animationDelay: `${Math.min(i, 30) * 15}ms` }} />
        {i % labelEvery === 0 && <span className="bar-month" aria-hidden="true">{labels.format(new Date(row.from))}</span>}
        {active === i && <span role="tooltip" aria-hidden="true" className="meter-usage-tip"
          style={{ bottom: `calc(${height}% + 8px)`, transform: `translateX(-${edge}%)` }}>
          <span>{periodOf(row, data.interval, data.timeZone)}</span>
          <strong>{kwh(row.kwh)} kWh</strong>
          <span className={row.partial ? "meter-usage-tip-partial" : undefined}>{coverage(row)}</span>
        </span>}
      </span>;
    })}
  </div>;
}

function UsageData({ data }: { data: UsageReadings }) {
  // The API uses integer Wh; sum in Wh here too, avoiding floating-point total drift.
  const total = data.readings.reduce((sum, row) => sum + Math.round(row.kwh * 1000), 0) / 1000;
  const shown = data.range && `Showing ${spanOf(data.range, data.timeZone)}${data.available ? ` of the simulation (${spanOf(data.available, data.timeZone)})` : ""}, ${data.timeZone} time.`;
  return <figure className="usage-bars">
    {data.readings.length ? <UsageChart data={data} /> : <p className="muted small">No usage readings in this range yet.</p>}
    <figcaption className="muted small meter-usage-caption" title={shown || undefined}>
      {data.readings.length > 0 && <span><strong className="meter-usage-total">{kwh(total)} kWh</strong> · {views[data.interval].window}</span>}
      {data.readings.some((row) => row.partial) && <span><span className="swatch sample" aria-hidden="true" />Striped: partial {views[data.interval].period}, some hours are missing</span>}
      <span className="meter-usage-synthetic" title={data.provenance.note}>Synthetic demo data, not real meter readings</span>
    </figcaption>
  </figure>;
}

type LoadState = { status: "loading" } | { status: "ready"; data: UsageReadings } | { status: "error"; message: string };

function IntervalReadings({ token, sin, interval, onExpired }: { token: string; sin: string; interval: ReadingInterval; onExpired: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });
    void api.readings(token, sin, interval, controller.signal).then((data) => {
      if (active) setState({ status: "ready", data });
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setState({ status: "error", message: error instanceof ApiError ? error.message : "We couldn't get the smart meter readings. Please try again." });
    });
    return () => { active = false; controller.abort(); };
  }, [token, sin, interval, attempt, onExpired]);
  return <div className="meter-usage-body" aria-busy={state.status === "loading"} aria-live="polite">
    {state.status === "loading" && <p role="status" className="muted small">Loading usage readings…</p>}
    {state.status === "error" && <><p className="error" role="alert">{state.message}</p><button type="button" className="ghost" onClick={() => setAttempt((n) => n + 1)}>Retry readings</button></>}
    {state.status === "ready" && <UsageData data={state.data} />}
  </div>;
}

/**
 * Home's usage card for a smart meter Household (a traditional one shows its last 12 Bills instead).
 * Parent mounts it only for smart meters, keyed by session and SIN.
 */
export function SmartMeterUsage({ token, household, onExpired }: { token: string; household: Household; onExpired: () => void }) {
  const [interval, setInterval] = useState<ReadingInterval>("day");
  return <section className="card usage-card smart-meter-usage" aria-label="Smart meter usage">
    <div className="usage-head"><h3>Your usage</h3><span className="muted small">kWh · smart meter {maskSin(household.sin)}</span></div>
    <div className="meter-usage-intervals" role="group" aria-label="Usage interval">
      {(["hour", "day", "week"] as const).map((value) => <button key={value} type="button"
        aria-pressed={interval === value} onClick={() => setInterval(value)}>{views[value].label}</button>)}
    </div>
    {/* A new interval immediately hides old values and aborts its request, even if fetch ignores abort. */}
    <IntervalReadings key={interval} token={token} sin={household.sin} interval={interval} onExpired={onExpired} />
  </section>;
}
