import { useState } from "react";
import type { BakitGanito as BakitGanitoData, ExtraLineItem } from "../api/client";
import { monthLabel, peso } from "../lib/format";

const EFFECT_HINT: Record<string, string> = {
  rate: "Nagbago ang singil kada kWh. Hindi mo ito kontrolado.",
  billingDays: "Mas mahaba o maikli ang billing period.",
  weather: "Epekto ng init ng panahon (tantya). Pindutin para sa detalye.",
  habit: "Ang bahaging galing sa sariling gamit ng bahay.",
};

const LINE_HINT: Record<string, (l: ExtraLineItem) => string> = {
  lifeline: (l) =>
    l.status === "gained"
      ? "Nakuha mo ang lifeline discount ngayong buwan."
      : l.status === "lost"
        ? "Nawala ang lifeline discount kasi lumampas ang gamit sa limit."
        : "Nagbago ang laki ng lifeline discount mo.",
  catchUp: (l) =>
    (l.kwh ?? 0) >= 0
      ? `Tantya lang ang nakaraang Bill. Mga ${l.kwh} kWh dito ay gamit pa noong nakaraang buwan.`
      : `Sobra ang tantya noong nakaraang buwan. Ibinawas dito ang mga ${Math.abs(l.kwh ?? 0)} kWh.`,
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
      ? `bawat mas mainit na araw ≈ +${sensitivity} kWh mula sa sariling mga Bill`
      : `bawat mas mainit na araw ≈ +${sensitivity} kWh (Cooling Appliance estimate)`;

  return (
    <section className="card result" aria-live="polite">
      <h2>Bakit ganito?</h2>
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
                      ? "Hindi pa masukat: tantya ang nakaraang Bill, kaya pinagsama ang dalawang buwan."
                      : EFFECT_HINT[e.key]}
              </small>
            </li>
          );
        })}
        <li className="total">
          <div className="effect-head">
            <span>Kabuuang pagbabago</span>
            <strong>{peso(r.total, true)}</strong>
          </div>
          <small>
            {reconciled
              ? "✓ Tugma sa totoong pagbabago ng Bill"
              : `May ${peso(r.unexplained!, true)} na hindi maipaliwanag mula sa mga singil. Titingnan ito sa Bill Checks.`}
          </small>
        </li>
      </ul>
      {extras.length > 0 && (
        <div className="extras">
          <h3>Hindi kasama sa paliwanag</h3>
          <p className="muted">Mga credit, refund, adjustment at balanse. Hiwalay ito sa gamit at singil ng buwan.</p>
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
              Naka-print na pagbabago: {peso(r.printedChange, true)} = {peso(r.total, true)} sa itaas{" "}
              {r.extrasChange >= 0 ? "+" : "−"} {peso(Math.abs(r.extrasChange))} na credits/adjustments
              {r.unexplained ? ` + ${peso(r.unexplained, true)} na hindi maipaliwanag` : ""}
            </small>
          )}
        </div>
      )}
    </section>
  );
}

