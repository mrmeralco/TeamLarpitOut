import { useEffect, useState, type ReactNode } from "react";
import { EelioMascot } from "./EelioMascot";

/**
 * Signed-out and linking screens. On desktop: a brand panel on the left and the screen as a
 * card on the right. On tablets and phones the panel hides and the screen fills the width;
 * sign-in and sign-up then show their own smaller Eelio (see `auth-mascot-mobile`).
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
          <EelioMascot replayKey={dashKey} />
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
