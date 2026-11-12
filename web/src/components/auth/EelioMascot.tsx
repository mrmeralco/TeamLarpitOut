import { useState } from "react";

/**
 * Eelio's entrance: swims in from the upper right, glides into place and waves.
 * Remounting (a new `replayKey`) or clicking replays it.
 */
export function EelioMascot({ replayKey = 0, className = "" }: { replayKey?: number; className?: string }) {
  const [clicks, setClicks] = useState(0);

  return (
    <div
      className={`auth-mascot-track ${className}`.trim()}
      onClick={() => setClicks((k) => k + 1)}
      title="Click to replay Eelio's dash"
    >
      <div key={`${replayKey}:${clicks}`} className="auth-mascot-runner">
        <div className="auth-mascot-y">
          <div className="auth-mascot-float">
            <div className="auth-mascot-glow" />

            {/* Phase 1: 6-frame swim, diving in from the upper right and gliding into place */}
            <div className="auth-mascot-stage stage-swim">
              <div className="auth-mascot-trail" />
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <img key={`swim-${n}`} src={`/mascot/eelio-swim-${n}.png`} alt="" className={`auth-mascot-frame swim-frame-${n}`} />
              ))}
            </div>

            {/* Phase 2: Turnaround & 6-frame Seamless Waving + Breathing at destination */}
            <div className="auth-mascot-stage stage-wave">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <img key={`wave-${n}`} src={`/mascot/eelio-wave-${n}.png`} alt={n === 1 ? "Eelio" : ""} className={`auth-mascot-frame wave-frame-${n}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
