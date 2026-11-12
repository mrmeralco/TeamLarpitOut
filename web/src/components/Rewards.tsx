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

  return (
    <section className="card rewards-card anchor" id="rewards" aria-labelledby="rewards-heading">
      <div className="rewards-header">
        <div className="rewards-title-row">
          <h2 id="rewards-heading">Rewards</h2>
          <span className="tag sample-rewards-badge">sample rewards</span>
        </div>
        <p className="muted rewards-disclaimer">
          Partner-funded sample rewards catalog. <strong>Not a deduction or discount on your Meralco bill.</strong>
        </p>
      </div>

      {loading && <p className="muted">Loading the Rewards catalog…</p>}
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
                🔒 {data.lockedPoints} Welcome Points unlock with your first savings
                {household.meter_type === "smart" ? " on a coming day." : " on a coming Bill."}
              </p>
            )}
            <p className="muted">
              1 point for every ₱2 you save {household.meter_type === "smart" ? "each day your smart meter reads" : "on your bill"}, more in hot El Niño months; none when there's a brownout. Use them on sample rewards from our partners.
            </p>
          </div>

          {confirmingItem && (
            <div className="notice confirm confirmation-box" role="dialog" aria-labelledby="confirm-redeem-title">
              <h4 id="confirm-redeem-title">Confirm redemption</h4>
              <p>
                Redeem <strong>{confirmingItem.name}</strong> for{" "}
                <strong>{confirmingItem.pointsCost} Points</strong>?
              </p>
              <div className="row confirmation-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={redeemingId !== null}
                  onClick={() => handleRedeem(confirmingItem)}
                >
                  {redeemingId === confirmingItem.id ? "Redeeming…" : "Yes, redeem"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={redeemingId !== null}
                  onClick={() => setConfirmingItem(null)}
                >
                  Cancel
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
                      <small className="muted">{item.pointsNeeded} more pts needed</small>
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
                      Not enough Points ({item.pointsNeeded} pts to go)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.earned && data.earned.length > 0 && (
            <div className="redemptions-history" data-testid="earned-history">
              <h3>Points earned</h3>
              <ul className="redemptions-list">
                {data.earned.map((e) => (
                  <li key={e.id} className="redemption-entry">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span>{e.description}</span>
                      <strong>{e.points > 0 ? `+${e.points}` : e.points} pts</strong>
                    </div>
                    {e.excludedReason && <small className="muted">{e.excludedReason}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.redemptions && data.redemptions.length > 0 && (
            <div className="redemptions-history" data-testid="redemptions-history">
              <h3>Redeemed Rewards</h3>
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
