import { useEffect, useRef, useState } from "react";

const BEATS = 3;

const STEP_ICONS = {
  household: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  appliances: "M5 3h14v18H5zM5 9h14M9 6h.01M12 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  routine: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
};
const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/**
 * Eelio's onboarding for the Missions tab, before Household Setup: Eelio swims in and walks the
 * person through three beats (want to save? → how points work → set up your home), then hands
 * off to the first setup step. One Eelio stays on screen and glides between beats.
 */
export function MissionsOnboarding({ welcomePoints, onStart, onLater, smart = false }: {
  welcomePoints: number;
  /** Smart meter homes earn points every day (ADR-0008); others at the next bill. */
  smart?: boolean;
  onStart: () => void;
  onLater: () => void;
}) {
  const [beat, setBeat] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const last = beat === BEATS - 1;
  const next = () => (last ? onStart() : setBeat((b) => b + 1));
  const back = () => setBeat((b) => Math.max(0, b - 1));

  useEffect(() => { dialog.current?.focus(); }, []);

  return (
    <div className="onb-backdrop">
      <div className={`onb beat-${beat}`} role="dialog" aria-modal="true" aria-labelledby={`onb-title-${beat}`} tabIndex={-1} ref={dialog}
        onKeyDown={(e) => {
          if (e.key === "Escape") onLater();
          else if (e.key === "ArrowRight") next();
          else if (e.key === "ArrowLeft") back();
        }}>
        <div className="onb-stage" aria-hidden="true">
          <span className="onb-ripple" />
          <span className="onb-spark s1">⚡</span>
          <span className="onb-spark s2">⚡</span>
          <span className="onb-spark s3">✦</span>
          <span className="onb-eelio-pos"><img className="onb-eelio" src="/mascot/eelio-hero.png" alt="" /></span>
        </div>

        <button type="button" className="onb-skip" onClick={onLater}>Maybe later</button>

        <div className="onb-body" key={beat}>
          {beat === 0 && <>
            <span className="onb-kicker">Hi, I'm Eelio!</span>
            <h2 id="onb-title-0">Want to save on your next bill?</h2>
            <p className="onb-lead">Use a little less power and I'll turn what you save into rewards. Let me show you how.</p>
          </>}
          {beat === 1 && <>
            <span className="onb-kicker">Eelio Rewards</span>
            <h2 id="onb-title-1">Save on your bill, earn points</h2>
            <p className="onb-lead">1 point for every ₱2 you save {smart ? "each day, as your smart meter reads it" : "on your next bill"}, with a bonus in hot El Niño months. A brownout earns none.</p>
            <ul className="onb-rewards">
              <li><span className="onb-coin" aria-hidden="true">₱</span><span>₱50 load</span><strong>250 pts</strong></li>
              <li><span className="onb-coin" aria-hidden="true">₱</span><span>₱100 e-wallet</span><strong>500 pts</strong></li>
              <li><span className="onb-coin" aria-hidden="true">₱</span><span>Store voucher</span><strong>750 pts</strong></li>
            </ul>
            <span className="tag sample-rewards-badge">Sample rewards</span>
          </>}
          {beat === 2 && <>
            <span className="onb-kicker">About 2 minutes</span>
            <h2 id="onb-title-2">First, help me get to know your home</h2>
            <ol className="onb-steps">
              <li><span className="onb-step-icon t1"><Svg d={STEP_ICONS.household} /></span><span><strong>Your household</strong><span>How many people live there</span></span></li>
              <li><span className="onb-step-icon t2"><Svg d={STEP_ICONS.appliances} /></span><span><strong>Your appliances</strong><span>Tap the ones you have</span></span></li>
              <li><span className="onb-step-icon t3"><Svg d={STEP_ICONS.routine} /></span><span><strong>Your daily routine</strong><span>Two quick picks</span></span></li>
            </ol>
            <p className="onb-note"><span className="pts">+{welcomePoints} pts</span> Welcome points appear in your balance right away.</p>
          </>}
        </div>

        <div className="onb-foot">
          <div className="onb-dots" aria-hidden="true">
            {Array.from({ length: BEATS }, (_, i) => <span key={i} className={i === beat ? "on" : i < beat ? "done" : ""} />)}
          </div>
          <span className="sr-only" aria-live="polite">Step {beat + 1} of {BEATS}</span>
          <div className="onb-actions">
            {beat > 0 && <button type="button" className="onb-back" onClick={back} aria-label="Back">‹</button>}
            <button type="button" className="onb-next" onClick={next}>
              {last ? `Start setup · earn ${welcomePoints} pts` : beat === 0 ? "Show me" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
