import { useEffect, useState } from "react";
import {
  missionPlanApi,
  usagePlanApi,
  type Household,
  type MissionPlan,
  type PointsResult,
  type SetupStatus,
} from "../api/client";
import { maskSin } from "../lib/format";
import { stored } from "../lib/routes";

type BoardView = "barangay" | "kapitbahay";

interface BarangayRow {
  rank: number;
  name: string;
  homes: number;
  kwhSaved: number;
  cutPct: number;
  gridStatus: "Shield Active" | "Peak Safe" | "Building";
  bonusPts: number;
  isYours?: boolean;
}

interface KapitbahayRow {
  rank: number;
  handle: string;
  title: string;
  meter: "Smart" | "Traditional";
  goalPct: number;
  kwhSaved: number;
  pts: number;
  isYou?: boolean;
}

function cityFromAddress(maskedAddress: string): string {
  const cleaned = maskedAddress.replace(/^•+\s*/, "").trim();
  return cleaned || "Quezon City";
}

function barangaySetForCity(city: string): { userBrgy: string; rows: BarangayRow[] } {
  const lower = city.toLowerCase();
  if (lower.includes("caloocan")) {
    return {
      userBrgy: "Brgy. 86 · Grace Park East",
      rows: [
        { rank: 1, name: "Brgy. 171 · Bagumbong", homes: 184, kwhSaved: 5120, cutPct: 7.1, gridStatus: "Shield Active", bonusPts: 50 },
        { rank: 2, name: "Brgy. 86 · Grace Park East", homes: 148, kwhSaved: 4620, cutPct: 6.4, gridStatus: "Peak Safe", bonusPts: 50, isYours: true },
        { rank: 3, name: "Brgy. 168 · Deparo", homes: 139, kwhSaved: 4190, cutPct: 5.8, gridStatus: "Peak Safe", bonusPts: 35 },
        { rank: 4, name: "Brgy. 78 · Monumento", homes: 112, kwhSaved: 3540, cutPct: 4.9, gridStatus: "Building", bonusPts: 25 },
        { rank: 5, name: "Brgy. 176 · Bagong Silang", homes: 96, kwhSaved: 2980, cutPct: 4.2, gridStatus: "Building", bonusPts: 20 },
      ],
    };
  }
  return {
    userBrgy: "Brgy. Bagong Pag-asa",
    rows: [
      { rank: 1, name: "Brgy. Teachers Village East", homes: 192, kwhSaved: 5340, cutPct: 7.4, gridStatus: "Shield Active", bonusPts: 50 },
      { rank: 2, name: "Brgy. Bagong Pag-asa", homes: 148, kwhSaved: 4620, cutPct: 6.4, gridStatus: "Peak Safe", bonusPts: 50, isYours: true },
      { rank: 3, name: "Brgy. UP Campus", homes: 134, kwhSaved: 4210, cutPct: 5.9, gridStatus: "Peak Safe", bonusPts: 35 },
      { rank: 4, name: "Brgy. Kamuning", homes: 118, kwhSaved: 3680, cutPct: 5.1, gridStatus: "Peak Safe", bonusPts: 25 },
      { rank: 5, name: "Brgy. Batasan Hills", homes: 104, kwhSaved: 3150, cutPct: 4.4, gridStatus: "Building", bonusPts: 20 },
    ],
  };
}

function loadHolderTag(): { nickname: string; title: string } {
  try {
    const raw = stored.get("holderProfile");
    if (!raw) return { nickname: "Kuya Juan", title: "Energy Detective" };
    const parsed = JSON.parse(raw) as { nickname?: string; title?: string };
    return {
      nickname: parsed.nickname?.trim() || "Kuya Juan",
      title: parsed.title?.trim() || "Energy Detective",
    };
  } catch {
    return { nickname: "Kuya Juan", title: "Energy Detective" };
  }
}

export function Leaderboards({
  token,
  household,
  setup,
}: {
  token?: string;
  household: Household;
  setup: SetupStatus | null;
}) {
  const [view, setView] = useState<BoardView>("barangay");
  const [pointsData, setPointsData] = useState<PointsResult | null>(null);
  const [planData, setPlanData] = useState<MissionPlan | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // Fetch plan first if setup is complete so smart-meter / bill settlement runs with active plan, then fetch points ledger
    const run = async () => {
      if (setup?.complete) {
        const plan = await missionPlanApi.get(token, household.sin).catch(() => null);
        if (!cancelled && plan) setPlanData(plan);
      }
      const pts = await usagePlanApi.points(token, household.sin).catch(() => null);
      if (!cancelled && pts) setPointsData(pts);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [token, household.sin, setup?.complete]);

  const city = cityFromAddress(household.masked_address);
  const baseBrgy = barangaySetForCity(city);
  const holder = loadHolderTag();

  const isSmart = household.meter_type === "smart";
  const verifiedKwh = pointsData
    ? Math.round(
        pointsData.history
          .filter((e) => e.source === "meter_verified" || e.source === "bill_verified")
          .reduce((sum, e) => sum + (e.savedKwh ?? 0), 0) * 10,
      ) / 10
    : null;
  const userKwhSaved = verifiedKwh !== null ? verifiedKwh : 0;
  const userPts = pointsData ? pointsData.balance : planData?.pointsBalance ?? 0;
  const goalKwh = planData?.goal.kwh ?? 15;
  const userGoalPct =
    userKwhSaved > 0 && goalKwh > 0
      ? Math.min(100, Math.round((userKwhSaved / goalKwh) * 100))
      : planData
        ? Math.min(100, Math.round(planData.covered * 100))
        : 0;

  const userBrgy = baseBrgy.userBrgy;
  const brgyRows: BarangayRow[] = baseBrgy.rows.map((r) =>
    r.isYours ? { ...r, kwhSaved: r.kwhSaved + Math.round(userKwhSaved) } : r,
  );
  const myBrgy = brgyRows.find((r) => r.isYours) ?? brgyRows[1]!;
  const targetKwh = 5000;
  const shieldPct = Math.min(100, Math.round((myBrgy.kwhSaved / targetKwh) * 100));

  const rawKapitbahay: Omit<KapitbahayRow, "rank">[] = [
    { handle: "@NanayRosa_04", title: "Eco Guardian", meter: "Smart", goalPct: 100, kwhSaved: 24.5, pts: 215 },
    { handle: "@TitoJun_Solar", title: "Peak Dodger", meter: "Smart", goalPct: 95, kwhSaved: 19.8, pts: 180 },
    {
      handle: `@${holder.nickname.replace(/\s+/g, "")}`,
      title: holder.title,
      meter: household.meter_type === "smart" ? "Smart" : "Traditional",
      goalPct: userGoalPct,
      kwhSaved: userKwhSaved,
      pts: userPts,
      isYou: true,
    },
    { handle: "@AteGrace_Home", title: "Cool Master", meter: "Traditional", goalPct: 86, kwhSaved: 14.2, pts: 155 },
    { handle: "@KuyaBen_88", title: "Watt Watcher", meter: "Smart", goalPct: 79, kwhSaved: 11.4, pts: 125 },
  ];
  const kapitbahayRows: KapitbahayRow[] = [...rawKapitbahay]
    .sort((a, b) => b.pts - a.pts || b.kwhSaved - a.kwhSaved)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));

  const medalFor = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`);

  return (
    <section className="dash leaderboard-dash" aria-labelledby="leaderboards-heading">
      <div className="dash-main">
        <div className="hero mood-charged leaderboard-hero">
          <div className="hero-copy">
            <p className="hero-hello">
              Bayanihan Grid League · {city} · {isSmart ? "⚡ Smart Meter Live" : "📟 Monthly Bill Sync"}
            </p>
            <h2 id="leaderboards-heading">{userBrgy}</h2>
            <p className="hero-amount">
              #{myBrgy.rank} in {city}
              <span className="hero-change down">▼ {myBrgy.cutPct}% peak load</span>
            </p>
            <p className="hero-line">
              {myBrgy.kwhSaved.toLocaleString("en-PH")} kWh saved together by {myBrgy.homes} homes ·{" "}
              {isSmart
                ? "your smart meter feeds daily peak-cut points into your barangay shield"
                : "keeping Meralco off pricey spot-market power"}
            </p>
            <button
              type="button"
              className="hero-play"
              onClick={() => setView((v) => (v === "barangay" ? "kapitbahay" : "barangay"))}
            >
              {view === "barangay" ? "🏡 See Kapitbahay savers" : "🏆 See Barangay league"}
            </button>
          </div>
          <img className="hero-mascot" src="/mascot/eelio-hero.png" alt="Eelio cheering on your barangay" />
        </div>
      </div>

      <aside className="dash-side" aria-label="Bayanihan Grid Shield">
        <div className="card goal-meter bayanihan-meter">
          <div className="goal-head">
            <div>
              <h3>Bayanihan Grid Shield</h3>
              <p className="muted small">
                Collective target for {userBrgy}: <strong>{targetKwh.toLocaleString("en-PH")} kWh</strong> saved this billing cycle
              </p>
            </div>
            <span className="goal-reward">+{myBrgy.bonusPts} pts bonus</span>
          </div>

          <div
            className="goal-bar-wrap"
            role="meter"
            aria-label="Barangay collective kWh goal"
            aria-valuemin={0}
            aria-valuemax={targetKwh}
            aria-valuenow={myBrgy.kwhSaved}
          >
            <div className="goal-bar">
              <span className="goal-seg c0" style={{ width: `${shieldPct}%` }} />
            </div>
            <span className="goal-bar-pct">
              <strong>{shieldPct}%</strong> ({myBrgy.kwhSaved.toLocaleString("en-PH")} / {targetKwh.toLocaleString("en-PH")} kWh)
            </span>
          </div>

          <div className="bayanihan-impact-strip">
            <div>
              <span className="muted small">Feeder Peak Cut</span>
              <strong>-{myBrgy.cutPct}% load</strong>
            </div>
            <div>
              <span className="muted small">Spot Market Shield</span>
              <strong>{myBrgy.gridStatus}</strong>
            </div>
            <div>
              <span className="muted small">Active Homes</span>
              <strong>{myBrgy.homes} bahay</strong>
            </div>
          </div>

          <p className="bayanihan-note muted small">
            💡 <strong>Why Bayanihan works:</strong> When your whole barangay trims peak use together, Meralco avoids buying extra electricity from expensive WESM spot-market plants — helping keep generation rates lower for every household.
          </p>
        </div>
      </aside>

      <div className="dash-wide">
        <section className="card leaderboard-card" aria-label="Bayanihan rankings">
          <div className="leaderboard-head">
            <div>
              <h3>{view === "barangay" ? `${city} Barangay League` : `Top Savers in ${userBrgy}`}</h3>
              <span className="muted small">
                {view === "barangay"
                  ? "Ranked by collective peak-load reduction and kWh saved across participating households"
                  : `Anonymized households in ${userBrgy} ranked by % of personal goal achieved (${maskSin(household.sin)})`}
              </span>
            </div>
            <div className="leaderboard-tabs" role="tablist" aria-label="Leaderboard scope">
              <button
                type="button"
                role="tab"
                aria-selected={view === "barangay"}
                className={`lb-tab${view === "barangay" ? " active" : ""}`}
                onClick={() => setView("barangay")}
              >
                🏘️ Per Barangay
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "kapitbahay"}
                className={`lb-tab${view === "kapitbahay" ? " active" : ""}`}
                onClick={() => setView("kapitbahay")}
              >
                🏡 Per Household
              </button>
            </div>
          </div>

          {view === "barangay" ? (
            <>
              <ul className="lb-podium" role="list" aria-label="Top 3 Barangays">
                {brgyRows.slice(0, 3).map((b) => (
                  <li key={b.rank} className={`lb-podium-card rank-${b.rank}${b.isYours ? " is-yours" : ""}`}>
                    <div className="lb-podium-top">
                      <span className="lb-medal">{medalFor(b.rank)}</span>
                      {b.isYours && <span className="lb-you-pill">Your Barangay</span>}
                    </div>
                    <strong className="lb-podium-name">{b.name}</strong>
                    <span className="lb-podium-stat">-{b.cutPct}% peak cut</span>
                    <span className="muted small">{b.kwhSaved.toLocaleString("en-PH")} kWh saved · {b.homes} homes</span>
                    <span className="mission-quest-pts">+{b.bonusPts} pts / home</span>
                  </li>
                ))}
              </ul>

              <ol className="lb-list">
                {brgyRows.map((b) => (
                  <li key={b.rank} className={`lb-row${b.isYours ? " is-yours" : ""}`}>
                    <span className={`lb-rank rank-${b.rank}`}>{medalFor(b.rank)}</span>
                    <div className="lb-row-main">
                      <div className="lb-row-title">
                        <strong>{b.name}</strong>
                        {b.isYours && <span className="lb-you-pill">Your Barangay</span>}
                        <span className="lb-status-chip">{b.gridStatus}</span>
                      </div>
                      <div className="lb-bar-track" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, (b.cutPct / 8) * 100)}%` }} />
                      </div>
                      <span className="muted small">{b.homes} participating households · {b.kwhSaved.toLocaleString("en-PH")} kWh saved together</span>
                    </div>
                    <div className="lb-row-side">
                      <strong className="lb-cut">-{b.cutPct}%</strong>
                      <span className="mission-quest-pts">+{b.bonusPts} pts</span>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <ul className="lb-podium" role="list" aria-label="Top 3 Households in Barangay">
                {kapitbahayRows.slice(0, 3).map((k) => (
                  <li key={k.rank} className={`lb-podium-card rank-${k.rank}${k.isYou ? " is-yours" : ""}`}>
                    <div className="lb-podium-top">
                      <span className="lb-medal">{medalFor(k.rank)}</span>
                      {k.isYou && <span className="lb-you-pill">You</span>}
                    </div>
                    <strong className="lb-podium-name">{k.handle}</strong>
                    <span className="lb-podium-stat">{k.goalPct}% goal hit</span>
                    <span className="muted small">{k.title} · {k.kwhSaved} kWh saved</span>
                    <span className="mission-quest-pts">+{k.pts} pts</span>
                  </li>
                ))}
              </ul>

              <ol className="lb-list">
                {kapitbahayRows.map((k) => (
                  <li key={k.rank} className={`lb-row${k.isYou ? " is-yours" : ""}`}>
                    <span className={`lb-rank rank-${k.rank}`}>{medalFor(k.rank)}</span>
                    <div className="lb-row-main">
                      <div className="lb-row-title">
                        <strong>{k.handle}</strong>
                        {k.isYou && <span className="lb-you-pill">You · {maskSin(household.sin)}</span>}
                        <span className="lb-status-chip">{k.title}</span>
                      </div>
                      <div className="lb-bar-track" aria-hidden="true">
                        <span style={{ width: `${k.goalPct}%` }} />
                      </div>
                      <span className="muted small">{k.meter} meter · {k.kwhSaved} kWh saved toward barangay shield</span>
                    </div>
                    <div className="lb-row-side">
                      <strong className="lb-cut">{k.goalPct}% goal</strong>
                      <span className="mission-quest-pts">+{k.pts} pts</span>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
