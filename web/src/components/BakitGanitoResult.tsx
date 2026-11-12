import { useState } from "react";
import type { BakitGanito as BakitGanitoData, ExtraLineItem } from "../api/client";
import { monthLabel, peso } from "../lib/format";

const EFFECT_HINT: Record<string, string> = {
  rate: "The rate per kWh changed. You can't control this.",
  billingDays: "The billing period was longer or shorter.",
  weather: "The effect of hotter or cooler weather (estimate). Tap for details.",
  habit: "The part that came from your household's own use.",
};

const LINE_HINT: Record<string, (l: ExtraLineItem) => string> = {
  lifeline: (l) =>
    l.status === "gained"
      ? "You got the lifeline discount this month."
      : l.status === "lost"
        ? "You lost the lifeline discount because usage went over the limit."
        : "Your lifeline discount changed.",
  catchUp: (l) =>
    (l.kwh ?? 0) >= 0
      ? `Last month's Bill was only an estimate. About ${l.kwh} kWh here were used last month.`
      : `Last month was over-estimated. About ${Math.abs(l.kwh ?? 0)} kWh were taken off here.`,
};

export function BakitGanitoResult({ r }: { r: BakitGanitoData }) {
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const rows = [...r.effects, ...r.lines];
  const max = Math.max(...rows.map((e) => Math.abs(e.amount)), 1);
  const extras = r.now.extras;
  const reconciled = r.unexplained === null || r.unexplained === 0;

  const weatherEffect = r.effects.find((e) => e.key === "weather");
  const sensitivity = weatherEffect?.sensitivity ?? r.weatherDetail?.heatSensitivity ?? 1.0;
  const sensitivitySource = weatherEffect?.sensitivitySource ?? r.weatherDetail?.source ?? "cooling_appliance_estimate";
  const weatherTapText =
    sensitivitySource === "history"
      ? `each hotter day ≈ +${sensitivity} kWh, from your own Bills`
      : `each hotter day ≈ +${sensitivity} kWh (Cooling Appliance estimate)`;

  return (
    <section className="card result" aria-live="polite">
      <h2>Why this bill?</h2>
      <p className="lede">
        {monthLabel(r.before.period)} {peso(r.before.rebuiltTotal)} → {monthLabel(r.now.period)} {peso(r.now.rebuiltTotal)}
      </p>
      <ul className="effects">
        {rows.map((e) => {
          const isWeather = e.key === "weather";
          const isExtra = e.key === "lifeline" || e.key === "catchUp";
          return (
            <li
              key={e.key}
              className={`${isExtra ? "extra-line" : ""} ${isWeather ? "interactive" : ""}`.trim()}
              onClick={isWeather ? () => setWeatherExpanded((v) => !v) : undefined}
              onKeyDown={
                isWeather
                  ? (evt) => {
                      if (evt.key === "Enter" || evt.key === " ") {
                        evt.preventDefault();
                        setWeatherExpanded((v) => !v);
                      }
                    }
                  : undefined
              }
              tabIndex={isWeather ? 0 : undefined}
              role={isWeather ? "button" : undefined}
              aria-expanded={isWeather ? weatherExpanded : undefined}
            >
              <div className="effect-head">
                <span>{e.label}</span>
                <strong className={e.amount < 0 ? "down" : e.amount > 0 ? "up" : ""}>{peso(e.amount, true)}</strong>
              </div>
              <div className="bar">
                <span className={e.amount < 0 ? "down" : "up"} style={{ width: `${(Math.abs(e.amount) / max) * 100}%` }} />
              </div>
              <small>
                {"status" in e || e.key === "catchUp"
                  ? LINE_HINT[e.key]!(e as ExtraLineItem)
                  : isWeather && weatherExpanded
                    ? weatherTapText
                    : e.key === "habit" && !r.habitMeasurable
                      ? "Can't be measured yet: last month's Bill was an estimate, so the two months are combined."
                      : EFFECT_HINT[e.key]}
              </small>
            </li>
          );
        })}
        <li className="total">
          <div className="effect-head">
            <span>Total change</span>
            <strong>{peso(r.total, true)}</strong>
          </div>
          <small>
            {reconciled
              ? "✓ Matches the actual change in the Bill"
              : `${peso(r.unexplained!, true)} can't be explained by the charges. See Bill Checks.`}
          </small>
        </li>
      </ul>
      {extras.length > 0 && (
        <div className="extras">
          <h3>Not part of the explanation</h3>
          <p className="muted">Credits, refunds, adjustments and balances. These are separate from the month's use and charges.</p>
          <ul>
            {extras.map((x, i) => (
              <li key={i} className="effect-head">
                <span>
                  {x.label} <span className="muted">· {x.kindLabel}</span>
                </span>
                <strong>{peso(x.amount, true)}</strong>
              </li>
            ))}
          </ul>
          {r.printedChange !== null && (
            <small className="muted">
              Printed change: {peso(r.printedChange, true)} = {peso(r.total, true)} above{" "}
              {r.extrasChange >= 0 ? "+" : "−"} {peso(Math.abs(r.extrasChange))} in credits/adjustments
              {r.unexplained ? ` + ${peso(r.unexplained, true)} unexplained` : ""}
            </small>
          )}
        </div>
      )}
    </section>
  );
}

