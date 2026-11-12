import type { Tab } from "../lib/routes";

const ICONS: Record<Tab, string> = {
  home: "m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  missions: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
  rewards: "M3 8h18v4H3zM5 12h14v9H5zM12 8v13M12 8c-2-4-6-4-6-1.5S10 8 12 8c2 0 6 0 6-1.5S14 4 12 8",
  account: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21a8 8 0 0 1 16 0",
};
const LABELS: Record<Tab, string> = { home: "Home", missions: "Missions", rewards: "Rewards", account: "Account" };

export function TabBar({ tab }: { tab: Tab }) {
  return <nav className="tabbar" aria-label="Main">
    {(Object.keys(LABELS) as Tab[]).map((t) => (
      <a key={t} href={`#/${t}`} aria-current={t === tab ? "page" : undefined}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[t]} /></svg>
        {LABELS[t]}
      </a>
    ))}
  </nav>;
}
