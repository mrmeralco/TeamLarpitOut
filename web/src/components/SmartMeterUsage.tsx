import { useEffect, useState } from "react";
import { api, ApiError, type Household, type ReadingInterval, type UsageReadings } from "../api/client";
import { maskSin } from "../lib/format";

const kwh = (value: number) => value.toLocaleString("en-PH", { maximumFractionDigits: 3 });
const date = (value: string, timeZone: string) => new Intl.DateTimeFormat("en-PH", {
  timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(value));
const views: Record<ReadingInterval, { label: string; title: string; window: string; period: string }> = {
  hour: { label: "Hour", title: "Hourly", window: "huling 24 oras na available", period: "oras" },
  day: { label: "Day", title: "Daily", window: "huling 30 araw na available", period: "araw" },
  week: { label: "Week", title: "Weekly", window: "huling 12 linggo na available", period: "linggo" },
};

function UsageChart({ data }: { data: UsageReadings }) {
  const max = Math.max(...data.readings.map((row) => row.kwh), 1);
  const width = 300 / data.readings.length;
  const labels = new Intl.DateTimeFormat("en-PH", {
    timeZone: data.timeZone,
    ...(data.interval === "hour" ? { hour: "numeric", minute: "2-digit" } as const : { month: "short", day: "numeric" } as const),
  });
  const labelEvery = Math.max(1, Math.ceil(data.readings.length / 4));
  return <figure className="usage-chart">
    <figcaption>{views[data.interval].title} usage · kWh{data.interval === "week" && " · linggo mula Lunes"}</figcaption>
    <svg viewBox="0 0 360 200" role="img" aria-label={`${views[data.interval].title} usage chart in kWh. Exact values are in the readings table.`}>
      {[0, 0.5, 1].map((fraction) => <g key={fraction}>
        <line x1="42" x2="342" y1={160 - fraction * 140} y2={160 - fraction * 140} className="usage-grid" />
        <text x="36" y={164 - fraction * 140} textAnchor="end">{kwh(max * fraction)}</text>
      </g>)}
      {data.readings.map((row, i) => <g key={row.from}>
        <rect x={42 + i * width + width * 0.15} y={160 - row.kwh / max * 140}
          width={width * 0.7} height={row.kwh / max * 140} className={row.partial ? "usage-bar partial" : "usage-bar"} />
        {i % labelEvery === 0 && <text x={42 + (i + 0.5) * width} y="181" textAnchor="middle">{labels.format(new Date(row.from))}</text>}
      </g>)}
    </svg>
  </figure>;
}

function UsageData({ data }: { data: UsageReadings }) {
  // The API uses integer Wh; sum in Wh here too, avoiding floating-point total drift.
  const total = data.readings.reduce((sum, row) => sum + Math.round(row.kwh * 1000), 0) / 1000;
  return <>
    <p className="notice">Synthetic demo data · Hindi ito totoong meter readings. {data.provenance.note}</p>
    {data.available && <p className="muted usage-window">Simulation: {date(data.available.from, data.timeZone)} – {date(data.available.to, data.timeZone)} (end exclusive).</p>}
    {data.range && <p className="muted usage-window">Ipinapakitang saklaw: {date(data.range.from, data.timeZone)} – {date(data.range.to, data.timeZone)} (end exclusive). Lahat ng oras: {data.timeZone}.</p>}
    {!data.readings.length ? <p>Wala pang usage readings sa saklaw na ito.</p> : <>
      <p className="usage-total"><strong>{kwh(total)} kWh</strong> · kabuuan ng available readings</p>
      <UsageChart data={data} />
      {data.readings.some((row) => row.partial) && <p className="muted">Partial: kulang ang oras o bahagi lang ng buong interval ang sakop. Hindi ito buong {views[data.interval].period}.</p>}
      <details>
        <summary>Tingnan ang readings table</summary>
        <div className="table-scroll"><table>
          <caption>{views[data.interval].title} readings · {data.timeZone} · hanggang sa end time, hindi kasama</caption>
          <thead><tr><th scope="col">Mula / hanggang</th><th scope="col">kWh</th><th scope="col">Coverage</th></tr></thead>
          <tbody>{data.readings.map((row) => <tr key={row.from}>
            <th scope="row">{date(row.from, data.timeZone)}<small>→ {date(row.to, data.timeZone)}</small></th>
            <td>{kwh(row.kwh)}</td><td>{row.partial ? "Partial" : "Complete"}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </>}
  </>;
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
      else setState({ status: "error", message: error instanceof ApiError ? error.message : "Hindi makuha ang smart meter readings. Subukan ulit." });
    });
    return () => { active = false; controller.abort(); };
  }, [token, sin, interval, attempt, onExpired]);
  return <div aria-busy={state.status === "loading"} aria-live="polite">
    {state.status === "loading" && <p role="status">Kinukuha ang usage readings…</p>}
    {state.status === "error" && <><p className="error" role="alert">{state.message}</p><button type="button" className="ghost" onClick={() => setAttempt((n) => n + 1)}>Subukan ulit ang readings</button></>}
    {state.status === "ready" && <UsageData data={state.data} />}
  </div>;
}

/** Parent mounts only for smart meters, keyed by session and SIN. */
export function SmartMeterUsage({ token, household, onExpired }: { token: string; household: Household; onExpired: () => void }) {
  const [interval, setInterval] = useState<ReadingInterval>("day");
  return <section className="card usage" aria-label="Smart meter usage">
    <h2>Smart meter usage · {maskSin(household.sin)}</h2>
    <div className="usage-intervals" role="group" aria-label="Usage interval">
      {(["hour", "day", "week"] as const).map((value) => <button key={value} type="button"
        aria-pressed={interval === value} onClick={() => setInterval(value)}>{views[value].label}</button>)}
    </div>
    <p className="muted">{views[interval].title} · {views[interval].window}</p>
    {/* A new interval immediately hides old values and aborts its request, even if fetch ignores abort. */}
    <IntervalReadings key={interval} token={token} sin={household.sin} interval={interval} onExpired={onExpired} />
  </section>;
}
