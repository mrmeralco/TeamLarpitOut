import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  rewardsApi,
  type CatalogRewardItem,
  type Household,
  type RewardsCatalogResult,
} from "../api/client";

interface RewardsProps {
  token: string;
  household: Household;
  onExpired: () => void;
  onPointsChanged?: () => void;
}

export function Rewards({ token, household, onExpired, onPointsChanged }: RewardsProps) {
  const [data, setData] = useState<RewardsCatalogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [confirmingItem, setConfirmingItem] = useState<CatalogRewardItem | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

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
          setError(err instanceof Error ? err.message : "Hindi ma-load ang Rewards catalog.");
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

  const handleRedeem = async (item: CatalogRewardItem) => {
    setRedeemingId(item.id);
    setFeedback(null);
    try {
      const res = await rewardsApi.redeem(token, household.sin, item.id);
      setFeedback({
        type: "success",
        message: `Matagumpay na na-redeem ang ${res.reward.name}! Bawas na ang ${res.redeemedPoints} Points sa balance mo.`,
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
        message: err instanceof Error ? err.message : "Hindi na-redeem ang reward. Pakisubukan muli.",
      });
    } finally {
      setRedeemingId(null);
    }
  };

  return (
    <section className="card rewards-card anchor" id="rewards" aria-labelledby="rewards-heading">
      <div className="rewards-header">
        <div className="rewards-title-row">
          <h2 id="rewards-heading">Rewards</h2>
          <span className="tag sample-rewards-badge">sample rewards</span>
        </div>
        <p className="muted rewards-disclaimer">
          Partner-funded sample rewards catalog. <strong>Hindi ito bawas o diskwento sa Meralco bill.</strong>
        </p>
      </div>

      {loading && <p className="muted">Kinukuha ang Rewards catalog…</p>}
      {error && <p className="error">{error}</p>}

      {feedback && (
        <div className={`notice ${feedback.type === "success" ? "confirm" : "warn"}`} role="alert">
          <p>{feedback.message}</p>
        </div>
      )}

      {data && (
        <>
          <div className="summary-callout" data-testid="rewards-balance">
            <div className="row">
              <span>Points balance</span>
              <strong>{data.balance} Points</strong>
            </div>
            {(data.lockedPoints ?? 0) > 0 && (
              <p className="small" data-testid="locked-points">
                🔒 {data.lockedPoints} Welcome Points ay naka-lock hanggang sa unang Verified Savings sa susunod na Bill.
              </p>
            )}
            <p className="muted">
              1 Point bawat ₱1 ng Verified Savings. Gamitin sa sample rewards mula sa aming partners.
            </p>
          </div>

          {confirmingItem && (
            <div className="notice confirm confirmation-box" role="dialog" aria-labelledby="confirm-redeem-title">
              <h4 id="confirm-redeem-title">Kumpirmahin ang pag-redeem</h4>
              <p>
                Sigurado ka bang nais mong i-redeem ang <strong>{confirmingItem.name}</strong> para sa{" "}
                <strong>{confirmingItem.pointsCost} Points</strong>?
              </p>
              <div className="row confirmation-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={redeemingId !== null}
                  onClick={() => handleRedeem(confirmingItem)}
                >
                  {redeemingId === confirmingItem.id ? "Rineredeem…" : "Oo, I-redeem"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={redeemingId !== null}
                  onClick={() => setConfirmingItem(null)}
                >
                  Kanselahin
                </button>
              </div>
            </div>
          )}

          <div className="rewards-catalog" role="list">
            {data.catalog.map((item) => (
              <div
                key={item.id}
                className={`reward-item-card ${item.affordable ? "affordable" : "unaffordable"}`}
                role="listitem"
                data-testid={`reward-card-${item.id}`}
              >
                <div className="reward-top-row">
                  <span className="tag sample-rewards-tag">sample rewards</span>
                  <span className="reward-category muted">{item.category}</span>
                </div>

                <h3 className="reward-name">{item.name}</h3>
                <p className="reward-partner muted">Partner: {item.partnerName}</p>
                <p className="reward-desc">{item.description}</p>

                <div className="reward-cost-row">
                  <span className="reward-cost-label">Halaga:</span>
                  <strong className="reward-cost">{item.pointsCost} Points</strong>
                </div>

                {!item.affordable && (
                  <div className="reward-progress-box" data-testid={`progress-${item.id}`}>
                    <div className="reward-progress-bar-bg" aria-hidden="true">
                      <div
                        className="reward-progress-bar-fill"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                    <div className="reward-progress-text">
                      <span>{item.progressPercent}% naipon</span>
                      <small className="muted">Kailangan pa ng {item.pointsNeeded} pts</small>
                    </div>
                  </div>
                )}

                <div className="reward-action-row">
                  {item.affordable ? (
                    <button
                      type="button"
                      className="primary wide"
                      disabled={redeemingId !== null}
                      onClick={() => setConfirmingItem(item)}
                    >
                      I-redeem
                    </button>
                  ) : (
                    <button type="button" className="wide" disabled>
                      Kulang ang Points ({item.pointsNeeded} pts pa)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.redemptions && data.redemptions.length > 0 && (
            <div className="redemptions-history" data-testid="redemptions-history">
              <h3>Mga Na-redeem na Reward</h3>
              <ul className="redemptions-list">
                {data.redemptions.map((r) => (
                  <li key={r.id} className="redemption-entry">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span>{r.description}</span>
                      <strong className="down">{r.points} pts</strong>
                    </div>
                    <small className="muted">
                      {new Date(r.createdAt).toLocaleDateString("fil-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
