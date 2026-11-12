import { useCallback, useEffect, useState } from "react";

export const TABS = ["home", "missions", "rewards", "account"] as const;
export type Tab = (typeof TABS)[number];
export interface Route { tab: Tab; sub: string[] }

const parse = (hash: string): Route => {
  const [name, ...sub] = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return TABS.includes(name as Tab) ? { tab: name as Tab, sub } : { tab: "home", sub: [] };
};

/** The current route from `#/home`, `#/missions/save`, … (no router library). Reload keeps it. */
export function useHashRoute(): [Route, (tab: Tab, ...sub: string[]) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((tab: Tab, ...sub: string[]) => {
    const hash = `#/${[tab, ...sub].join("/")}`;
    if (window.location.hash !== hash) window.location.hash = hash.slice(1);
    setRoute({ tab, sub });
  }, []);
  return [route, go];
}

/** The raw hash, kept in sync (signed-out screens use #/signup, #/signin, #/create-password/<token>). */
export function useRawHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
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
