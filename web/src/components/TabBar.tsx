import type { Tab } from "../lib/routes";

const ICONS: Record<Tab, string> = {
  home: "m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  missions: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
  rewards: "M3 8h18v4H3zM5 12h14v9H5zM12 8v13M12 8c-2-4-6-4-6-1.5S10 8 12 8c2 0 6 0 6-1.5S14 4 12 8",
  leaderboards: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z",
  account: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21a8 8 0 0 1 16 0",
};
const LABELS: Record<Tab, string> = { home: "Home", missions: "Missions", rewards: "Rewards", leaderboards: "Leaderboards", account: "Account" };

/**
 * The app's navigation: a sidebar on desktop that folds into an icon rail (to give the content
 * more room), and a bottom tab bar on phones.
 */
export function TabBar({ tab, onLogout, collapsed = false, onToggle }: { tab: Tab; onLogout?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  return <nav className={`tabbar${collapsed ? " collapsed" : ""}`} aria-label="Main">
    <div className="tabbar-top">
      <div className="tabbar-brand" aria-hidden="true">
        <span className="brand-mark"><img src="/icon-192.png" alt="" /></span>
        <span className="tabbar-text">Eelio</span>
      </div>
      {onToggle && (
        <button type="button" className="tabbar-toggle" onClick={onToggle} aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} title={collapsed ? "Expand" : "Collapse"}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} /></svg>
        </button>
      )}
    </div>
    {(Object.keys(LABELS) as Tab[]).map((t) => (
      <a key={t} href={`#/${t}`} aria-current={t === tab ? "page" : undefined} title={collapsed ? LABELS[t] : undefined}>
        <span className="tabbar-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[t]} /></svg>
        </span>
        <span className="tabbar-text">{LABELS[t]}</span>
      </a>
    ))}
    {onLogout && (
      <button type="button" className="tabbar-logout" onClick={onLogout} aria-label="Log out" title={collapsed ? "Log out" : undefined}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        <span className="tabbar-text">Log out</span>
      </button>
    )}
  </nav>;
}
