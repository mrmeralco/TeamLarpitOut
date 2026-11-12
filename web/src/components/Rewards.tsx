import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  rewardsApi,
  type CatalogRewardItem,
  type Household,
  type RewardsCatalogResult,
} from "../api/client";
import { EelioLoader } from "./EelioLoader";

interface RewardsProps {
  token: string;
  household: Household;
  onExpired: () => void;
  onPointsChanged?: () => void;
}

type Filter = "all" | CatalogRewardItem["category"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "load", label: "Load" },
  { id: "e-wallet", label: "E-wallet" },
  { id: "voucher", label: "Vouchers" },
];

/** Eelio's moods, as on Home and Missions: charged when a reward is ready, sleepy with no Points yet. */
type Mood = "charged" | "detective" | "sleepy";
const MOOD: Record<Mood, { img: string; title: string }> = {
  charged: { img: "/mascot/eelio-hero.png", title: "Fully Charged" },
  detective: { img: "/mascot/eelio-detective.png", title: "Bill Detective" },
  sleepy: { img: "/mascot/eelio-sleepy.png", title: "Low Battery" },
};

/** Same tile colours as the Missions quest icons. */
const CATEGORY_TONE: Record<CatalogRewardItem["category"], number> = { load: 0, "e-wallet": 2, voucher: 1 };

const CATEGORY_ICON: Record<CatalogRewardItem["category"], string> = {
  load: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  "e-wallet": "M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01",
  voucher: "M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM10 6v12",
};

const ICON = {
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  gift: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z",
  off: "M5 12h14",
  shield: "M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
};

/** Player level: one level per 500 Points ever earned, with a rank name as you go up. */
const XP_PER_LEVEL = 500;
const RANKS = [
  { from: 1, name: "Spark" },
  { from: 3, name: "Watt Watcher" },
  { from: 6, name: "Power Saver" },
  { from: 10, name: "Grid Guardian" },
  { from: 20, name: "Eelio Legend" },
] as const;

const TIERS = ["Common", "Rare", "Epic", "Legendary"] as const;

/** The peso amount in a reward's name ("₱50 Mobile Load" → "₱50"), shown big on its card. */
const pesoValue = (name: string) => name.match(/₱[\d,]+/)?.[0] ?? null;

const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export function Rewards({ token, household, onExpired, onPointsChanged }: RewardsProps) {
  const [data, setData] = useState<RewardsCatalogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [confirmingItem, setConfirmingItem] = useState<CatalogRewardItem | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [historyTab, setHistoryTab] = useState<"earned" | "redeemed">("earned");

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      rewardsApi
        .catalog(token, household.sin, signal)
        .then((res) => {
          setData(res);
          setLoading(false);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (err instanceof ApiError && err.status === 401) {
            onExpired();
            return;
          }
          setError(err instanceof Error ? err.message : "Couldn't load the Rewards catalog.");
          setLoading(false);
        });
    },
    [token, household.sin, onExpired],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!confirmingItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && redeemingId === null) setConfirmingItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmingItem, redeemingId]);

  const handleRedeem = async (item: CatalogRewardItem) => {
    setRedeemingId(item.id);
    setFeedback(null);
    try {
      const res = await rewardsApi.redeem(token, household.sin, item.id);
      setFeedback({
        type: "success",
        message: `${res.reward.name} redeemed! ${res.redeemedPoints} Points were taken off your balance.`,
      });
      setConfirmingItem(null);
      load();
      if (onPointsChanged) onPointsChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onExpired();
        return;
      }
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Couldn't redeem the reward. Please try again.",
      });
    } finally {
      setRedeemingId(null);
    }
  };

  /** The closest reward not yet affordable: what to save toward next. */
  const nextGoal = useMemo(() => {
    const locked = (data?.catalog ?? []).filter((i) => !i.affordable);
    return locked.length ? locked.reduce((a, b) => (b.pointsNeeded < a.pointsNeeded ? b : a)) : null;
  }, [data]);

  const readyCount = data?.catalog.filter((i) => i.affordable).length ?? 0;
  const catalog = data?.catalog ?? [];
  /** "All" plus only the categories that have rewards, each with its count. */
  const filters = FILTERS.map((f) => ({ ...f, count: f.id === "all" ? catalog.length : catalog.filter((i) => i.category === f.id).length }))
    .filter((f) => f.count > 0);
  const visible = catalog.filter((i) => filter === "all" || i.category === filter);
  /** Rarity by price within the catalog: the cheapest rewards are Common, the priciest Legendary. */
  const costs = [...new Set(catalog.map((i) => i.pointsCost))].sort((a, b) => a - b);
  const tierOf = (cost: number) => TIERS[costs.length < 2 ? 0 : Math.round((costs.indexOf(cost) / (costs.length - 1)) * (TIERS.length - 1))]!;
  const smart = household.meter_type === "smart";
  const hasEarned = (data?.earned?.length ?? 0) > 0;
  const hasRedeemed = (data?.redemptions?.length ?? 0) > 0;
  const tab = historyTab === "earned" && !hasEarned && hasRedeemed ? "redeemed" : historyTab;

  if (loading && !data) {
    return (
      <section className="dash loading" id="rewards" aria-busy="true" aria-label="Rewards">
        <EelioLoader
          variant="rewards"
          badge="Rewards Vault"
          title="Loading the Rewards catalog…"
        />
      </section>
    );
  }

  const mood: Mood = readyCount > 0 ? "charged" : (data?.balance ?? 0) > 0 ? "detective" : "sleepy";
  const sinceLast = data?.earned?.find((e) => e.points > 0);
  const redeemedCount = data?.redemptions?.length ?? 0;
  /** XP = every Point ever earned: what's left plus what was spent on Rewards. */
  const xp = (data?.balance ?? 0) + (data?.redemptions ?? []).reduce((s, r) => s + Math.abs(r.points), 0);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelXp = xp % XP_PER_LEVEL;
  const rank = RANKS.filter((r) => level >= r.from).at(-1)!.name;
  /** With everything unlocked, the priciest reward is the one to claim. */
  const topLoot = catalog.filter((i) => i.affordable).reduce<CatalogRewardItem | null>((a, b) => (!a || b.pointsCost > a.pointsCost ? b : a), null);

  return (
    <section className="dash mission-dash rewards-dash anchor" id="rewards" aria-labelledby="rewards-heading">
      <div className="dash-main">
        <div className={`hero mood-${mood}`}>
          <div className="hero-copy" data-testid="rewards-balance">
            <div className="player-card">
              <span className="player-level" aria-label={`Level ${level}`}>
                <Svg d={ICON.shield} />
                <b>{level}</b>
              </span>
              <span className="player-info">
                <span className="player-rank"><span className="player-lv">LV {level}</span> {rank}</span>
                <span className="player-xp" role="progressbar" aria-label="XP to next level" aria-valuemin={0} aria-valuemax={XP_PER_LEVEL} aria-valuenow={levelXp}>
                  <span style={{ width: `${Math.max((levelXp / XP_PER_LEVEL) * 100, 3)}%` }} />
                </span>
                <span className="player-xp-text">{levelXp} / {XP_PER_LEVEL} XP</span>
              </span>
            </div>

            <h2 id="rewards-heading">Rewards</h2>
            <p className="hero-amount rewards-balance-pop">
              <span className="rewards-coin" aria-hidden="true">★</span>
              {data ? data.balance.toLocaleString("en-PH") : "–"} <span className="hero-amount-unit">Points</span>
            </p>

            {data && (
              <ul className="rewards-stats">
                <li className={readyCount > 0 ? "on" : ""}>
                  <strong>{readyCount}/{catalog.length}</strong>
                  <span>{readyCount > 0 ? `${readyCount} ready to redeem` : "unlocked"}</span>
                </li>
                <li>
                  <strong>{redeemedCount}</strong>
                  <span>redeemed</span>
                </li>
                <li>
                  <strong>{sinceLast ? `+${sinceLast.points}` : "0"}</strong>
                  <span>last earned</span>
                </li>
              </ul>
            )}

            {data && (data.lockedPoints ?? 0) > 0 && (
              <p className="hero-line rewards-locked" data-testid="locked-points">
                <span className="rewards-lock" aria-hidden="true"><Svg d={ICON.lock} /></span>
                {data.lockedPoints} Welcome Points unlock after your first savings
              </p>
            )}
            <p className="hero-line rewards-earn-note">1 pt per ₱2 saved {smart ? "daily" : "per bill"}</p>
          </div>
          <img className="hero-mascot" src={MOOD[mood].img} alt={`Eelio, ${MOOD[mood].title}`} />
        </div>
      </div>

      <aside className="dash-side" aria-label="Next reward">
        <div className={`card goal-meter loot-card${data && !nextGoal ? " reached" : ""}`}>
          {nextGoal ? (
            <>
              <span className="loot-kicker">Next reward</span>
              <div className="loot-row">
                <span className={`loot-icon tone-${CATEGORY_TONE[nextGoal.category]}`} aria-hidden="true">
                  <Svg d={CATEGORY_ICON[nextGoal.category]} />
                  <span className="loot-icon-lock"><Svg d={ICON.lock} /></span>
                </span>
                <span className="loot-info">
                  <strong>{nextGoal.name}</strong>
                  <span className="goal-reward"><span className="coin" aria-hidden="true">★</span>{nextGoal.pointsCost} pts</span>
                </span>
              </div>
              <div className="goal-track" role="progressbar" aria-label={`Progress to ${nextGoal.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={nextGoal.progressPercent}>
                <span className="goal-seg tone-0" style={{ width: `${Math.max(nextGoal.progressPercent, 3)}%` }} />
              </div>
              <p className="goal-status loot-status">
                <span>{nextGoal.progressPercent}%</span>
                <span>{nextGoal.pointsNeeded} pts to go</span>
              </p>
            </>
          ) : (
            <>
              <span className="loot-kicker">Vault cleared</span>
              <div className="loot-row">
                <span className="loot-icon trophy" aria-hidden="true"><Svg d={ICON.trophy} /></span>
                <span className="loot-info">
                  <strong>Every reward unlocked</strong>
                  {topLoot && <span className="muted small">Top pick: {topLoot.name}</span>}
                </span>
              </div>
              {topLoot && (
                <button
                  type="button"
                  className="primary reward-redeem loot-claim"
                  disabled={redeemingId !== null}
                  onClick={() => setConfirmingItem(topLoot)}
                >
                  Claim top reward
                </button>
              )}
            </>
          )}
          <p className="muted small rewards-disclaimer">Sample partner rewards. Not a Meralco bill discount.</p>
        </div>
      </aside>

      <div className="dash-wide">
        {loading && data && (
          <EelioLoader compact variant="rewards" badge="Rewards Vault" title="Loading the Rewards catalog…" />
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {feedback && (
          <div className={`notice ${feedback.type === "success" ? "confirm" : "warn"}`} role="alert">
            <p>{feedback.message}</p>
          </div>
        )}

        {data && (
          <div className="card quests-card">
            <div className="quests-card-head rewards-shop-head">
              <h3>Rewards shop</h3>
            </div>
            {filters.length > 2 && (
              <div className="rewards-filter" role="group" aria-label="Filter rewards">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={filter === f.id ? "active" : ""}
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label} <span className="rewards-filter-count">{f.count}</span>
                  </button>
                ))}
              </div>
            )}

            <ul className="reward-grid">
              {visible.map((item, i) => {
                const tier = tierOf(item.pointsCost);
                const value = pesoValue(item.name);
                return (
                  <li key={item.id} style={{ animationDelay: `${i * 60}ms` }}>
                    <div
                      className={`reward-card tone-${CATEGORY_TONE[item.category]} ${item.affordable ? "affordable" : "locked"}`}
                      data-testid={`reward-card-${item.id}`}
                    >
                      <div className="reward-card-art">
                        <span className={`reward-tier ${tier.toLowerCase()}`}>{tier}</span>
                        {item.affordable ? (
                          <span className="reward-ribbon">Unlocked</span>
                        ) : (
                          <span className="reward-lock" aria-label="Locked"><Svg d={ICON.lock} /></span>
                        )}
                        <span className="reward-card-icon" aria-hidden="true"><Svg d={CATEGORY_ICON[item.category]} /></span>
                        {value && <span className="reward-card-value">{value}</span>}
                      </div>

                      <div className="reward-card-body">
                        <strong className="reward-card-name">{item.name}</strong>
                        <span className="reward-card-partner">
                          {item.partnerName} <span className="tag sample-rewards-tag">sample rewards</span>
                        </span>

                        {!item.affordable && (
                          <div className="reward-xp" data-testid={`progress-${item.id}`}>
                            <div className="reward-xp-bar" aria-hidden="true">
                              <span style={{ width: `${Math.max(item.progressPercent, 4)}%` }} />
                            </div>
                            <div className="reward-xp-text">
                              <span>{item.progressPercent}%</span>
                              <span>{item.pointsNeeded} pts to go</span>
                            </div>
                          </div>
                        )}

                        <div className="reward-card-foot">
                          <span className="goal-reward"><span className="coin" aria-hidden="true">★</span>{item.pointsCost}</span>
                          {item.affordable && (
                            <button
                              type="button"
                              className="primary reward-redeem"
                              disabled={redeemingId !== null}
                              onClick={() => setConfirmingItem(item)}
                            >
                              I-redeem
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {data && (hasEarned || hasRedeemed) && (
          <div className="card quests-card">
            <div className="quests-card-head rewards-history-head">
              <div>
                <h3>History</h3>
              </div>
              <div className="rewards-filter" role="tablist" aria-label="Points history">
                {hasEarned && (
                  <button type="button" role="tab" aria-selected={tab === "earned"} className={tab === "earned" ? "active" : ""} onClick={() => setHistoryTab("earned")}>
                    Points earned
                  </button>
                )}
                {hasRedeemed && (
                  <button type="button" role="tab" aria-selected={tab === "redeemed"} className={tab === "redeemed" ? "active" : ""} onClick={() => setHistoryTab("redeemed")}>
                    Redeemed Rewards
                  </button>
                )}
              </div>
            </div>

            {tab === "earned" && hasEarned && (
              <ul className="redemptions-list" data-testid="earned-history">
                {data.earned!.map((e) => (
                  <li key={e.id} className="redemption-entry">
                    <span className={`history-icon ${e.points > 0 ? "plus" : "zero"}`} aria-hidden="true"><Svg d={e.points > 0 ? ICON.bolt : ICON.off} /></span>
                    <div className="history-main">
                      <span>{e.description}</span>
                      {e.excludedReason && <small className="muted">{e.excludedReason}</small>}
                    </div>
                    <strong className={e.points > 0 ? "history-pts plus" : "history-pts"}>{e.points > 0 ? `+${e.points}` : e.points} pts</strong>
                  </li>
                ))}
              </ul>
            )}

            {tab === "redeemed" && hasRedeemed && (
              <ul className="redemptions-list" data-testid="redemptions-history">
                {data.redemptions.map((r) => (
                  <li key={r.id} className="redemption-entry">
                    <span className="history-icon minus" aria-hidden="true"><Svg d={ICON.gift} /></span>
                    <div className="history-main">
                      <span>{r.description}</span>
                      <small className="muted">
                        {new Date(r.createdAt).toLocaleDateString("fil-PH", { year: "numeric", month: "short", day: "numeric" })}
                      </small>
                    </div>
                    <strong className="history-pts">{r.points} pts</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {confirmingItem && (
        <div className="redeem-sheet-backdrop" onClick={() => redeemingId === null && setConfirmingItem(null)}>
          <div
            className="redeem-sheet confirmation-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-redeem-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className={`mission-quest-icon tone-${CATEGORY_TONE[confirmingItem.category]}`} aria-hidden="true">
              <Svg d={CATEGORY_ICON[confirmingItem.category]} />
            </span>
            <h4 id="confirm-redeem-title">Confirm redemption</h4>
            <p>
              Redeem <strong>{confirmingItem.name}</strong> for{" "}
              <strong>{confirmingItem.pointsCost} Points</strong>?
            </p>
            {data && (
              <p className="muted small">
                Balance after: {Math.max(0, data.balance - confirmingItem.pointsCost)} Points
              </p>
            )}
            <div className="confirmation-actions">
              <button
                type="button"
                className="ghost"
                disabled={redeemingId !== null}
                onClick={() => setConfirmingItem(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={redeemingId !== null}
                onClick={() => handleRedeem(confirmingItem)}
              >
                {redeemingId === confirmingItem.id ? "Redeeming…" : "Yes, redeem"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
