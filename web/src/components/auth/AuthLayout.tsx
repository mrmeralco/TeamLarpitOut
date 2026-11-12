import { useEffect, useState, type ReactNode } from "react";

/**
 * Signed-out and linking screens. On desktop: a brand panel on the left and the screen as a
 * card on the right. On tablets and phones the panel hides and the screen fills the width.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const [dashKey, setDashKey] = useState(0);

  useEffect(() => {
    const onHash = () => setDashKey((k) => k + 1);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="auth-layout">
      <aside className="auth-aside" aria-hidden="true">
        <div className="auth-aside-hero">
          <div
            className="auth-mascot-track"
            onClick={() => setDashKey((k) => k + 1)}
            title="Click to replay Eelio's dash"
          >
            <div key={dashKey} className="auth-mascot-runner">
              <div className="auth-mascot-y">
                <div className="auth-mascot-float">
                  <div className="auth-mascot-glow" />

                  {/* Phase 1: 6-frame swim, diving in from the upper right and gliding into place */}
                  <div className="auth-mascot-stage stage-swim">
                    <div className="auth-mascot-trail" />
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <img
                        key={`swim-${n}`}
                        src={`/mascot/eelio-swim-${n}.png`}
                        alt=""
                        className={`auth-mascot-frame swim-frame-${n}`}
                      />
                    ))}
                  </div>

                  {/* Phase 2: Turnaround & 6-frame Seamless Waving + Breathing at destination */}
                  <div className="auth-mascot-stage stage-wave">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <img
                        key={`wave-${n}`}
                        src={`/mascot/eelio-wave-${n}.png`}
                        alt={n === 1 ? "Eelio" : ""}
                        className={`auth-mascot-frame wave-frame-${n}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div key={`copy-${dashKey}`} className="auth-aside-copy">
            <h1 className="auth-aside-brand">Eelio</h1>
            <p className="auth-aside-tagline">
              Your personal companion that helps you understand your electricity bills and save energy in one place.
            </p>
          </div>
        </div>
      </aside>
      <div className="auth-panel">{children}</div>
    </div>
  );
}
