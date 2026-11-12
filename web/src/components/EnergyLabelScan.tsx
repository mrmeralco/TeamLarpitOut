import { useEffect, useRef, useState } from "react";
import { ApiError, appliancesApi, type EnergyLabelDraft, type EnergyLabelInput } from "../api/client";

type Review = { consumptionKwh: string; period: "monthly" | "daily" | ""; referenceDays: string; referenceHoursPerDay: string };
const text = (value: number | null) => value === null ? "" : String(value);
const positive = (value: number) => Number.isFinite(value) && value > 0;

/** Scan results remain local drafts until the user explicitly confirms them. */
export function EnergyLabelScan({ token, sin, type, value, onConfirm, onRemove, onExpired }: {
  token: string;
  sin: string;
  type: "aircon" | "refrigerator";
  value?: EnergyLabelInput;
  onConfirm: (label: EnergyLabelInput) => void;
  onRemove: () => void;
  onExpired: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EnergyLabelDraft | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const name = type === "aircon" ? "Aircon" : "Refrigerator";

  useEffect(() => () => request.current?.abort(), [token, sin, type]);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setDraft(null);
    setReview(null);
    setError(null);
  }

  async function scan(photo: File) {
    cancel();
    if (photo.size > 10 * 1024 * 1024) {
      setError("Photos can be up to 10 MB. Retake a smaller one or use your answers.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await appliancesApi.scanLabel(token, sin, type, photo, controller.signal);
      if (controller.signal.aborted) return;
      setDraft(result);
      setReview({
        consumptionKwh: text(result.label.consumptionKwh), period: result.label.period ?? "",
        referenceDays: text(result.label.referenceDays), referenceHoursPerDay: text(result.label.referenceHoursPerDay),
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(err instanceof Error ? err.message : "We couldn't read the energy label. Try again or use your answers.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const consumption = Number(review?.consumptionKwh);
  const days = review?.period === "daily" ? 1 : Number(review?.referenceDays);
  const hours = type === "aircon" ? Number(review?.referenceHoursPerDay) : 24;
  const normalized = consumption / days / hours;
  const valid = review && review.period !== "" && positive(consumption) && positive(days) && positive(hours) && hours <= 24
    && positive(normalized) && Number.isFinite(normalized * 24 * 20);

  return (
    <div className="energy-label-scan">
      {value && <div className="confirmed-label">
        <span className="tag source-label">From the energy label</span>
        <p>{value.consumptionKwh} kWh/{value.period === "monthly" ? "month" : "day"}
          {value.period === "monthly" ? ` · ${value.referenceDays} days/month` : ""}
          {type === "aircon" ? ` · ${value.referenceHoursPerDay} hours/day` : ""}</p>
        <button type="button" className="ghost" onClick={() => { cancel(); onRemove(); }}>Remove the energy label</button>
      </div>}
      <input ref={input} className="label-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment"
        aria-label={`Energy label photo for ${name}`} onChange={(event) => {
          const photo = event.target.files?.[0];
          event.target.value = "";
          if (photo) void scan(photo);
        }} />
      <button type="button" className="ghost wide" onClick={() => input.current?.click()}>
        {value || draft || loading ? "Retake the energy label" : "Scan the energy label"}
      </button>
      {loading && <p role="status">Reading the energy label…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {draft && review && <div className="label-review" role="group" aria-label={`Review the energy label for ${name}`}>
        <h4>Is the energy label right?</h4>
        <p>Correct what we read before confirming. This is for one appliance; your count and routine are used for the estimate.</p>
        {draft.assumptions.length > 0 && <div className="label-assumptions">
          <strong>Assumptions — please check</strong>
          <ul>{draft.assumptions.map((a) => <li key={a.field}>{a.reason}</li>)}</ul>
        </div>}
        {draft.missing.length > 0 && <p>Some values weren't read. Fill in the values and basis below.</p>}
        <label><span>kWh on the label</span><input type="number" min="0" step="any" inputMode="decimal" value={review.consumptionKwh}
          onChange={(e) => setReview({ ...review, consumptionKwh: e.target.value })} /></label>
        <label><span>Consumption period</span><select value={review.period}
          onChange={(e) => setReview({ ...review, period: e.target.value as Review["period"], referenceDays: e.target.value === "daily" ? "1" : "" })}>
          <option value="">Choose the period…</option><option value="monthly">Per month</option><option value="daily">Per day</option>
        </select></label>
        {review.period === "monthly" && <label><span>Days in a month (the label's basis)</span><input type="number" min="0" step="any" inputMode="decimal"
          value={review.referenceDays} onChange={(e) => setReview({ ...review, referenceDays: e.target.value })} /></label>}
        {type === "aircon" ? <label><span>Hours per day (the label's basis)</span><input type="number" min="0" max="24" step="any" inputMode="decimal"
          value={review.referenceHoursPerDay} onChange={(e) => setReview({ ...review, referenceHoursPerDay: e.target.value })} /></label>
          : <p className="muted">Ref: averaged over all 24 hours of the day.</p>}
        {valid ? <p className="label-preview">{Number(normalized.toPrecision(6))} kWh/hour{type === "refrigerator" ? " (average)" : " while running"}</p>
          : <p className="error">Enter a positive kWh and the correct basis. Up to 24 hours/day only.</p>}
        <button type="button" className="primary" disabled={!valid} onClick={() => {
          if (!valid || !review.period) return;
          onConfirm({ consumptionKwh: consumption, period: review.period, ...(review.period === "monthly" ? { referenceDays: days } : {}),
            ...(type === "aircon" ? { referenceHoursPerDay: hours } : {}), confirmed: true });
          cancel();
        }}>Correct, use the energy label</button>
        <p className="muted">After confirming, tap Save to save it for your home.</p>
      </div>}
      {(loading || draft || error) && <button type="button" className="ghost wide" onClick={cancel}>Don't use the scan</button>}
      {!value && !draft && !loading && <small className="muted">Optional. You can also use your answers or the typical value.</small>}
    </div>
  );
}
