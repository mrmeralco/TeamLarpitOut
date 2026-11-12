import type { ReactNode } from "react";
import { Icon, ICON } from "./AuthScreens";

/**
 * Signed-out and linking screens. On desktop: a brand panel on the left and the screen as a
 * card on the right. On tablets and phones the panel hides and the screen fills the width.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-layout">
    <aside className="auth-aside" aria-hidden="true">
      <div className="brand"><span className="brand-mark"><Icon d={ICON.bolt} width={2.2} /></span>Eelio</div>
      <div className="auth-aside-copy">
        <h2>Understand your Meralco bill, peso by peso</h2>
        <p>See why your bill changed, check it against Meralco's own figures, and earn rewards when you use less.</p>
      </div>
      <ul className="features">
        <li><span className="feature-icon"><Icon d={ICON.receipt} size={16} width={2.2} /></span>Every charge explained in plain words</li>
        <li><span className="feature-icon"><Icon d={ICON.chart} size={16} width={2.2} /></span>Scan one bill, get 12 months of history</li>
        <li><span className="feature-icon"><Icon d={ICON.star} size={16} width={2.2} /></span>Points for verified savings</li>
      </ul>
    </aside>
    <div className="auth-panel">{children}</div>
  </div>;
}
