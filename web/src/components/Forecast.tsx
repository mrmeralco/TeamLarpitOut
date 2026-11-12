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
      fail(err, "Hindi makuha ang Forecast.");
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
      setError("Maglagay ng wastong numero ng reading.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await usagePlanApi.saveReading(token, household.sin, { reading: n });
      setData(res);
    } catch (err) {
      fail(err, "Hindi na-save ang Mid-month Reading.");
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
      fail(err, "Hindi nabura ang reading.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="forecast" className="card forecast anchor" aria-live="polite">
      <h2>Forecast para sa Susunod na Bill</h2>
      {error && <p className="error">{error}</p>}
      {!data ? (
        !error && <p className="muted">Kinukuwenta ang forecast…</p>
      ) : (
        <>
          {data.heatWave.active && data.heatWave.banner && (
            <div
              className="banner heat-wave"
              role="alert"
              style={{
                background: "#fef2f2",
                border: "1px solid #f87171",
                color: "#991b1b",
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
                Inaasahang Bill sa {monthLabel(data.period)}:{" "}
                <strong style={{ fontSize: "1.25rem", color: "var(--color-primary, #0284c7)" }}>
                  {peso(data.range.minPesos)} – {peso(data.range.maxPesos)}
                </strong>{" "}
                <span className="muted">({data.range.minKwh} – {data.range.maxKwh} kWh)</span>
              </p>
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                Range mula sa Bill History at 14-day weather forecast. I-type ang kasalukuyang numero ng metro para paliitin ito sa isang numero.
              </p>

              <form onSubmit={handleSave} style={{ marginTop: "16px" }}>
                <label>
                  <span>Mid-month Reading (kasalukuyang numero sa metro)</span>
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
                    Huling reading sa bill: <strong>{data.lastReading} kWh</strong>
                  </small>
                )}
                <button type="submit" className="primary" disabled={saving || !readingInput}>
                  {saving ? "Sine-save…" : "I-update ang Forecast"}
                </button>
              </form>
            </div>
          ) : data.projected ? (
            <div className="forecast-single-box">
              <p>
                Inaasahang Bill sa {monthLabel(data.period)}:{" "}
                <strong style={{ fontSize: "1.35rem", color: "var(--color-primary, #0284c7)" }}>
                  {peso(data.projected.pesos)}
                </strong>{" "}
                <span className="muted">({data.projected.kwh} kWh)</span>
              </p>

              <div
                style={{
                  background: "var(--bg-subtle, #f8fafc)",
                  padding: "12px",
                  borderRadius: "6px",
                  margin: "12px 0",
                  fontSize: "0.9rem",
                }}
              >
                <div>
                  <strong>{data.projected.kwhSoFar} kWh</strong> nagamit na sa loob ng{" "}
                  <strong>{data.projected.elapsedDays} araw</strong>.
                </div>
                <div className="muted">
                  Natitira sa billing period: {data.projected.remainingDays} araw.
                </div>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  Meter reading na tinayp: {data.projected.reading} kWh
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
                      data.targetComparison.status === "within_target" ? "#ecfdf5" : "#fffbeb",
                    border: `1px solid ${
                      data.targetComparison.status === "within_target" ? "#10b981" : "#f59e0b"
                    }`,
                    color:
                      data.targetComparison.status === "within_target" ? "#065f46" : "#92400e",
                  }}
                >
                  <strong>
                    {data.targetComparison.status === "within_target" ? "🟢" : "🟡"}{" "}
                    {data.targetComparison.label}
                  </strong>
                  <div style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                    Target sa buwang ito: {peso(data.targetComparison.targetPesos)} ({data.targetComparison.targetKwh} kWh)
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button type="button" className="ghost" onClick={handleDelete} disabled={saving}>
                  {saving ? "Tinatanggal…" : "Burahin ang reading (ibalik sa range)"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
