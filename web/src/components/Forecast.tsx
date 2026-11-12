import { useEffect, useState } from "react";
import {
  ApiError,
  usagePlanApi,
  type ForecastResult,
  type Household,
} from "../api/client";
import { monthLabel, peso } from "../lib/format";

export function Forecast({
  token,
  household,
  onExpired,
}: {
  token: string;
  household: Household;
  onExpired: () => void;
}) {
  const [data, setData] = useState<ForecastResult | null>(null);
  const [readingInput, setReadingInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) onExpired();
    else setError(err instanceof Error ? err.message : fallback);
  };

  async function load(signal?: AbortSignal) {
    try {
      const res = await usagePlanApi.forecast(token, household.sin, signal);
      setData(res);
      if (res.hasReading && res.projected) {
        setReadingInput(String(res.projected.reading));
      }
    } catch (err) {
      if (signal?.aborted) return;
      fail(err, "Couldn't get the Forecast.");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, household.sin]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(readingInput);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid reading.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await usagePlanApi.saveReading(token, household.sin, { reading: n });
      setData(res);
    } catch (err) {
      fail(err, "Couldn't save the Mid-month Reading.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      const res = await usagePlanApi.deleteReading(token, household.sin);
      setData(res);
      setReadingInput("");
    } catch (err) {
      fail(err, "Couldn't delete the reading.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="forecast" className="card forecast anchor" aria-live="polite">
      <h2>Forecast for your next Bill</h2>
      {error && <p className="error">{error}</p>}
      {!data ? (
        !error && <p className="muted">Calculating the forecast…</p>
      ) : (
        <>
          {data.heatWave.active && data.heatWave.banner && (
            <div
              className="banner heat-wave"
              role="alert"
              style={{
                background: "var(--bad-soft)",
                border: "1px solid color-mix(in srgb, var(--bad) 20%, transparent)",
                color: "var(--bad)",
                borderRadius: "8px",
                padding: "12px 16px",
                marginBottom: "16px",
                fontWeight: 500,
              }}
            >
              🔥 {data.heatWave.banner}
            </div>
          )}

          {!data.hasReading && data.range ? (
            <div className="forecast-range-box">
              <p>
                Expected Bill for {monthLabel(data.period)}:{" "}
                <strong style={{ fontSize: "1.25rem", color: "var(--primary)" }}>
                  {peso(data.range.minPesos)} – {peso(data.range.maxPesos)}
                </strong>{" "}
                <span className="muted">({data.range.minKwh} – {data.range.maxKwh} kWh)</span>
              </p>
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                A range from your Bill History and the 14-day weather forecast. Type your current meter reading to narrow it to one figure.
              </p>

              <form onSubmit={handleSave} style={{ marginTop: "16px" }}>
                <label>
                  <span>Mid-month Reading (current number on the meter)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={data.lastReading ? `hal. ${data.lastReading + 100}` : "hal. 12550"}
                    value={readingInput}
                    onChange={(e) => setReadingInput(e.target.value)}
                    required
                  />
                </label>
                {data.lastReading !== null && (
                  <small className="muted" style={{ display: "block", marginBottom: "8px" }}>
                    Last reading on the bill: <strong>{data.lastReading} kWh</strong>
                  </small>
                )}
                <button type="submit" className="primary" disabled={saving || !readingInput}>
                  {saving ? "Saving…" : "Update the Forecast"}
                </button>
              </form>
            </div>
          ) : data.projected ? (
            <div className="forecast-single-box">
              <p>
                Expected Bill for {monthLabel(data.period)}:{" "}
                <strong style={{ fontSize: "1.35rem", color: "var(--primary)" }}>
                  {peso(data.projected.pesos)}
                </strong>{" "}
                <span className="muted">({data.projected.kwh} kWh)</span>
              </p>

              <div
                style={{
                  background: "var(--muted)",
                  padding: "12px",
                  borderRadius: "6px",
                  margin: "12px 0",
                  fontSize: "0.9rem",
                }}
              >
                <div>
                  <strong>{data.projected.kwhSoFar} kWh</strong> used in{" "}
                  <strong>{data.projected.elapsedDays} days</strong>.
                </div>
                <div className="muted">
                  Left in the billing period: {data.projected.remainingDays} days.
                </div>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  Meter reading typed: {data.projected.reading} kWh
                </div>
              </div>

              {data.targetComparison && (
                <div
                  className={`target-status ${data.targetComparison.status}`}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    margin: "12px 0",
                    background:
                      data.targetComparison.status === "within_target" ? "var(--ok-soft)" : "var(--warn-soft)",
                    border: `1px solid ${
                      data.targetComparison.status === "within_target" ? "var(--ok)" : "var(--warn)"
                    }`,
                    color:
                      data.targetComparison.status === "within_target" ? "var(--ok)" : "var(--warn)",
                  }}
                >
                  <strong>
                    {data.targetComparison.status === "within_target" ? "🟢" : "🟡"}{" "}
                    {data.targetComparison.label}
                  </strong>
                  <div style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                    This month's target: {peso(data.targetComparison.targetPesos)} ({data.targetComparison.targetKwh} kWh)
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button type="button" className="ghost" onClick={handleDelete} disabled={saving}>
                  {saving ? "Removing…" : "Delete the reading (back to the range)"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
