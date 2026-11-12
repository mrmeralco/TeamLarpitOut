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
      setError("Hanggang 10 MB lang ang litrato. Kunan ulit nang mas maliit o gamitin ang mga sagot mo.");
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
      else setError(err instanceof Error ? err.message : "Hindi mabasa ang energy label. Subukan ulit o gamitin ang mga sagot mo.");
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
        <span className="tag source-label">Mula sa energy label</span>
        <p>{value.consumptionKwh} kWh/{value.period === "monthly" ? "buwan" : "araw"}
          {value.period === "monthly" ? ` · ${value.referenceDays} araw/buwan` : ""}
          {type === "aircon" ? ` · ${value.referenceHoursPerDay} oras/araw` : ""}</p>
        <button type="button" className="ghost" onClick={() => { cancel(); onRemove(); }}>Alisin ang energy label</button>
      </div>}
      <input ref={input} className="label-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment"
        aria-label={`Litrato ng energy label para sa ${name}`} onChange={(event) => {
          const photo = event.target.files?.[0];
          event.target.value = "";
          if (photo) void scan(photo);
        }} />
      <button type="button" className="ghost wide" onClick={() => input.current?.click()}>
        {value || draft || loading ? "Kunan ulit ang energy label" : "I-scan ang energy label"}
      </button>
      {loading && <p role="status">Binabasa ang energy label…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {draft && review && <div className="label-review" role="group" aria-label={`Suriin ang energy label ng ${name}`}>
        <h4>Tama ba ang energy label?</h4>
        <p>Itama ang nabasa bago kumpirmahin. Para ito sa isang appliance; ang bilang at routine mo ang gagamitin sa tantya.</p>
        {draft.assumptions.length > 0 && <div className="label-assumptions">
          <strong>Paunang palagay — pakisuri</strong>
          <ul>{draft.assumptions.map((a) => <li key={a.field}>{a.reason}</li>)}</ul>
        </div>}
        {draft.missing.length > 0 && <p>May hindi nabasa. Kumpletuhin ang mga halaga at batayan sa ibaba.</p>}
        <label><span>kWh sa label</span><input type="number" min="0" step="any" inputMode="decimal" value={review.consumptionKwh}
          onChange={(e) => setReview({ ...review, consumptionKwh: e.target.value })} /></label>
        <label><span>Panahon ng konsumo</span><select value={review.period}
          onChange={(e) => setReview({ ...review, period: e.target.value as Review["period"], referenceDays: e.target.value === "daily" ? "1" : "" })}>
          <option value="">Piliin ang panahon…</option><option value="monthly">Bawat buwan</option><option value="daily">Bawat araw</option>
        </select></label>
        {review.period === "monthly" && <label><span>Araw sa isang buwan (batayan ng label)</span><input type="number" min="0" step="any" inputMode="decimal"
          value={review.referenceDays} onChange={(e) => setReview({ ...review, referenceDays: e.target.value })} /></label>}
        {type === "aircon" ? <label><span>Oras bawat araw (batayan ng label)</span><input type="number" min="0" max="24" step="any" inputMode="decimal"
          value={review.referenceHoursPerDay} onChange={(e) => setReview({ ...review, referenceHoursPerDay: e.target.value })} /></label>
          : <p className="muted">Ref: average sa buong 24 oras bawat araw.</p>}
        {valid ? <p className="label-preview">{Number(normalized.toPrecision(6))} kWh/oras{type === "refrigerator" ? " (average)" : " habang ginagamit"}</p>
          : <p className="error">Ilagay ang positibong kWh at tamang batayan. Hanggang 24 oras/araw lang.</p>}
        <button type="button" className="primary" disabled={!valid} onClick={() => {
          if (!valid || !review.period) return;
          onConfirm({ consumptionKwh: consumption, period: review.period, ...(review.period === "monthly" ? { referenceDays: days } : {}),
            ...(type === "aircon" ? { referenceHoursPerDay: hours } : {}), confirmed: true });
          cancel();
        }}>Tama, gamitin ang energy label</button>
        <p className="muted">Pagkatapos kumpirmahin, pindutin ang I-save para mai-save sa bahay.</p>
      </div>}
      {(loading || draft || error) && <button type="button" className="ghost wide" onClick={cancel}>Huwag gamitin ang scan</button>}
      {!value && !draft && !loading && <small className="muted">Opsyonal. Puwede ring gamitin ang mga sagot mo o ang default na tantya.</small>}
    </div>
  );
}
