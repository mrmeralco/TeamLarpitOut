import { useCallback, useEffect, useState } from "react";

export const TABS = ["home", "missions", "rewards", "account"] as const;
export type Tab = (typeof TABS)[number];

const parse = (hash: string): Tab => {
  const name = hash.replace(/^#\/?/, "").split("/")[0] as Tab;
  return TABS.includes(name) ? name : "home";
};

/** The current tab from `#/home`, `#/missions`, … (no router library). Reload keeps it. */
export function useHashTab(): [Tab, (tab: Tab) => void] {
  const [tab, setTab] = useState<Tab>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setTab(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((next: Tab) => {
    if (window.location.hash !== `#/${next}`) window.location.hash = `/${next}`;
    setTab(next);
  }, []);
  return [tab, go];
}

/** Per-tab session storage: survives a reload, gone when the tab closes. Never required to work. */
export const stored = {
  get(key: string): string | null {
    try { return window.sessionStorage.getItem(`kuryenteko.${key}`); } catch { return null; }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) window.sessionStorage.removeItem(`kuryenteko.${key}`);
      else window.sessionStorage.setItem(`kuryenteko.${key}`, value);
    } catch { /* storage unavailable: the session just won't survive a reload */ }
  },
};
