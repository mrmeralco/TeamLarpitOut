import { useEffect, useState } from "react";
import {
  ApiError,
  usagePlanApi,
  type Household,
  type Mission,
  type PointsResult,
  type TargetResult,
  type UsagePlan as Plan,
} from "../api/client";
import { monthLabel, peso } from "../lib/format";

const MAX_MISSIONS = 3;

function PlanSummary({
  plan,
  points,
  onEdit,
  onSelfReport,
  selfReportStatus,
}: {
  plan: Plan;
  points: PointsResult | null;
  onEdit: () => void;
  onSelfReport: (missionId: string) => void;
  selfReportStatus: string | null;
}) {
  const total = plan.missions.reduce((s, m) => s + m.pesoValue, 0);
  return (
    <>
      {points && (
        <div style={{ background: "var(--muted)", padding: "10px 12px", marginBottom: "14px", borderRadius: "var(--radius)" }}>
          <div className="effect-head">
            <span>⭐ Naipong Points</span>
            <strong>{points.balance} Points</strong>
          </div>
          <small className="muted" style={{ display: "block", marginTop: "4px", fontSize: "0.8rem" }}>
            1 Point bawat ₱1 ng Verified Savings sa susunod na Bill. Brownouts excluded; walang points ang self-report.
          </small>
        </div>
      )}
      <p>
        Target sa {monthLabel(plan.period)}: <strong>{peso(plan.targetPesos)}</strong> ({plan.targetKwh} kWh, −{plan.cut}%)
      </p>
      <ul className="plan-missions">
        {plan.missions.map((m) => (
          <li key={m.id} className="effect-head" style={{ alignItems: "center" }}>
            <div>
              <span>{m.title}</span>
              <button
                type="button"
                className="ghost"
                style={{ fontSize: "0.75rem", padding: "2px 6px", marginLeft: "8px" }}
                onClick={() => onSelfReport(m.id)}
              >
                Markahang tapos
              </button>
            </div>
            <strong>{peso(m.pesoValue)}</strong>
          </li>
        ))}
      </ul>
      {selfReportStatus && (
        <p className="muted" style={{ fontSize: "0.85rem", padding: "6px 8px", background: "var(--secondary)", borderRadius: "var(--radius)" }}>
          {selfReportStatus}
        </p>
      )}
      <small className="muted">
        Mga {peso(total)} ang tipid kung magagawa lahat. Susuriin ito sa susunod na Bill.
      </small>
      <button type="button" className="ghost wide" onClick={onEdit}>
        Baguhin ang Target o Missions
      </button>

      {points && points.history.length > 0 && (
        <div style={{ marginTop: "14px", borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
          <h4 style={{ fontSize: "0.85rem", margin: "0 0 6px" }}>Kasaysayan ng Points</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
            {points.history.map((h) => (
              <li key={h.id} className="effect-head" style={{ fontSize: "0.8rem" }}>
                <span>{h.description}</span>
                <strong className={h.points > 0 ? "down" : ""}>+{h.points} pts</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function MissionItem(props: { mission: Mission; checked: boolean; disabled: boolean; onToggle: () => void }) {
  const m = props.mission;
  return (
    <li className={`mission ${props.checked ? "chosen" : ""}`}>
      <label className="check">
        <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={props.onToggle} />
        <span>
          <strong>{m.title}</strong>
          {m.basis === "assumption" && <span className="tag source-default">May palagay</span>}
        </span>
      </label>
      <p>{m.message}</p>
      <div className="effect-head">
        <small className="muted">{m.kwhSaved} kWh</small>
        <strong className="down">{peso(m.pesoValue)}</strong>
      </div>
      {m.assumptions.length > 0 && (
        <small className="muted assumptions">
          Palagay pa lang: {m.assumptions.map((a) => `${a.label} = ${a.value}`).join("; ")}
        </small>
      )}
    </li>
  );
}

/** Target and Missions for the next billing period (traditional meter). Parent keys it by session, SIN and appliance changes. */
export function UsagePlan({ token, household, onExpired }: { token: string; household: Household; onExpired: () => void }) {
  const [target, setTarget] = useState<TargetResult | null>(null);
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [needsAppliances, setNeedsAppliances] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [editing, setEditing] = useState(false);
  const [cut, setCut] = useState<5 | 10 | 15>(10);
  const [chosen, setChosen] = useState<string[]>([]);
  const [airconSetting, setAirconSetting] = useState("");
  const [saving, setSaving] = useState(false);
  const [points, setPoints] = useState<PointsResult | null>(null);
  const [selfReportStatus, setSelfReportStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) onExpired();
    else setError(err instanceof Error ? err.message : fallback);
  };

  async function loadMissions(setting?: number, signal?: AbortSignal) {
    try {
      const res = await usagePlanApi.missions(token, household.sin, setting, signal);
      setMissions(res.missions);
      setNeedsAppliances(false);
      setChosen((c) => c.filter((id) => res.missions.some((m) => m.id === id)));
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiError && err.status === 409) setNeedsAppliances(true);
      else fail(err, "Hindi makuha ang mga Mission.");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [t, p, pts] = await Promise.all([
          usagePlanApi.target(token, household.sin, controller.signal),
          usagePlanApi.plan(token, household.sin, controller.signal),
          usagePlanApi.points(token, household.sin, controller.signal).catch(() => null),
        ]);
        setTarget(t);
        if (pts) setPoints(pts);
        if (p.active && p.plan) {
          setPlan(p.plan);
          setCut(p.plan.cut);
          setChosen(p.plan.missions.map((m) => m.id));
          if (p.plan.airconSetting) setAirconSetting(String(p.plan.airconSetting));
        } else setEditing(true);
        await loadMissions(p.active && p.plan?.airconSetting ? p.plan.airconSetting : undefined, controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) fail(err, "Hindi makuha ang Target.");
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, household.sin]);

  const setting = airconSetting && Number(airconSetting) >= 16 && Number(airconSetting) <= 30 ? Number(airconSetting) : undefined;

  async function handleSelfReport(missionId: string) {
    try {
      const res = await usagePlanApi.selfReport(token, household.sin, { missionId, status: "tapos na" });
      setSelfReportStatus(res.message);
    } catch (err) {
      fail(err, "Hindi maitala ang self-report.");
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await usagePlanApi.save(token, household.sin, { cut, missionIds: chosen, ...(setting ? { airconSetting: setting } : {}) });
      setPlan(res.plan);
      setEditing(false);
    } catch (err) {
      fail(err, "Hindi na-save ang plan.");
    } finally {
      setSaving(false);
    }
  }

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const hasAircon = missions?.some((m) => m.appliance === "aircon") ?? false;

  return (
    <section id="missions" className="card usage-plan anchor" aria-live="polite">
      <h2>Target at Missions</h2>
      {error && <p className="error">{error}</p>}
      {!target ? (
        !error && <p className="muted">Kinukuha…</p>
      ) : plan && !editing ? (
        <PlanSummary
          plan={plan}
          points={points}
          onEdit={() => setEditing(true)}
          onSelfReport={handleSelfReport}
          selfReportStatus={selfReportStatus}
        />
      ) : (
        <>
          <p className="muted">
            Inaasahang gamit sa {monthLabel(target.period)}: {target.baseline.kwh} kWh, mga {peso(target.baseline.pesos)}.{" "}
            {target.baseline.weatherAdjusted
              ? target.baseline.weatherKwhPerDay > 0
                ? `Kasama ang +${target.baseline.weatherKwhPerDay} kWh/araw dahil mas mainit ang inaasahang panahon.`
                : target.baseline.weatherKwhPerDay < 0
                  ? `Bawas ang ${Math.abs(target.baseline.weatherKwhPerDay)} kWh/araw dahil mas malamig ang inaasahang panahon.`
                  : "Halos parehong panahon ang inaasahan."
              : "Wala pang weather forecast, kaya batay lang sa huling Bill."}
          </p>
          <div className="cuts" role="radiogroup" aria-label="Gaano kalaking bawas?">
            {target.options.map((o) => (
              <button
                key={o.cut}
                type="button"
                role="radio"
                aria-checked={cut === o.cut}
                className={`cut ${cut === o.cut ? "selected" : ""}`}
                onClick={() => setCut(o.cut)}
              >
                <span>−{o.cut}%</span>
                <strong>{peso(o.pesos)}</strong>
                <small>tipid {peso(o.savings)}</small>
              </button>
            ))}
          </div>

          <h3>Pumili ng 1 hanggang {MAX_MISSIONS} Mission</h3>
          {needsAppliances ? (
            <p className="muted">Ilista muna ang mga appliance sa itaas para makita ang mga Mission na bagay sa bahay mo.</p>
          ) : !missions ? (
            <p className="muted">Kinukuwenta…</p>
          ) : (
            <>
              {hasAircon && (
                <label>
                  <span>Setting ng aircon ngayon, °C (opsyonal)</span>
                  <input
                    type="number"
                    min={16}
                    max={30}
                    inputMode="numeric"
                    placeholder="hal. 22"
                    value={airconSetting}
                    onChange={(e) => setAirconSetting(e.target.value)}
                    onBlur={() => void loadMissions(setting)}
                  />
                </label>
              )}
              <ul className="missions">
                {missions.map((m) => (
                  <MissionItem
                    key={m.id}
                    mission={m}
                    checked={chosen.includes(m.id)}
                    disabled={!chosen.includes(m.id) && chosen.length >= MAX_MISSIONS}
                    onToggle={() => toggle(m.id)}
                  />
                ))}
              </ul>
              <small className="muted">
                Kinuwenta ng app ang bawat piso mula sa mga appliance mo at sa singil kada kWh ng Rate Schedule ng{" "}
                {monthLabel(target.rateSchedulePeriod)}.
              </small>
            </>
          )}
          <button type="button" className="primary" disabled={saving || chosen.length === 0 || needsAppliances} onClick={save}>
            {saving ? "Sine-save…" : "Simulan ang plan"}
          </button>
          {plan && (
            <button type="button" className="ghost wide" onClick={() => setEditing(false)}>
              Huwag na lang baguhin
            </button>
          )}
        </>
      )}
    </section>
  );
}
