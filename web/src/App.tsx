import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Household, type LoginResult } from "./api/client";
import { SignIn } from "./components/SignIn";
import { LinkFlow } from "./components/LinkFlow";
import { HouseholdPicker } from "./components/HouseholdPicker";
import { BillHistory } from "./components/BillHistory";
import { SmartMeterUsage } from "./components/SmartMeterUsage";
import { Appliances } from "./components/Appliances";
import { UsagePlan } from "./components/UsagePlan";
import { Forecast } from "./components/Forecast";
import { Home } from "./components/Home";
import { Rewards } from "./components/Rewards";
import { BakitGanitoResult } from "./components/BakitGanitoResult";
import { TabBar } from "./components/TabBar";
import { stored, useHashTab } from "./lib/routes";

const EXPIRED = "Nag-expire ang session. Mag-sign in ulit.";

/**
 * Signed out: sign-in → code → link CAN → scan → "Tama ba?", one screen at a time.
 * Signed in with an active Household: the app shell with Home · Missions · Rewards · Account.
 */
export function App() {
  const [session, setSession] = useState<LoginResult | null>(null);
  const [restoring, setRestoring] = useState(() => stored.get("token") !== null);
  const [selectedSin, setSelectedSin] = useState(() => stored.get("household") ?? "");
  /** Bumped when appliances are saved so Missions are recomputed. */
  const [applianceVersion, setApplianceVersion] = useState(0);
  const [rewardsVersion, setRewardsVersion] = useState(0);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [tab, go] = useHashTab();

  const begin = useCallback((next: LoginResult, preferSin?: string) => {
    setSession(next);
    stored.set("token", next.token);
    const sin = next.households.find((h) => h.sin === preferSin)?.sin ?? next.households[0]?.sin ?? "";
    setSelectedSin(sin);
    stored.set("household", sin || null);
  }, []);
  const end = useCallback((notice: string | null) => {
    setSession(null); setSelectedSin(""); setLinking(false); setSessionNotice(notice);
    stored.set("token", null); stored.set("household", null);
  }, []);
  const onExpired = useCallback(() => end(EXPIRED), [end]);

  // A reload keeps the session (and the tab, via the hash) until the token expires.
  useEffect(() => {
    const token = stored.get("token");
    if (!token) return;
    const controller = new AbortController();
    api.households(token, controller.signal)
      .then((households) => begin({ token, households }, stored.get("household") ?? undefined))
      .catch((err) => { if (!controller.signal.aborted) end(err instanceof ApiError && err.status === 401 ? EXPIRED : null); })
      .finally(() => { if (!controller.signal.aborted) setRestoring(false); });
    return () => controller.abort();
  }, [begin, end]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(onExpired, 60 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [session, onExpired]);

  const select = (sin: string) => { setSelectedSin(sin); stored.set("household", sin); };
  const selected: Household | undefined = session?.households.find((h) => h.sin === selectedSin);

  if (restoring) return <main className="flow-screen"><p className="muted" role="status">Binubuksan…</p></main>;

  if (!session) {
    return <main className="flow-screen">
      <header><h1>KuryenteKo</h1><p>Bakit ganito ang bill ko?</p></header>
      {sessionNotice && <p role="status" className="muted">{sessionNotice}</p>}
      <SignIn onLogin={(next) => { begin(next); setSessionNotice(null); }} />
    </main>;
  }

  if (linking || !selected) {
    return <main className="flow-screen">
      <LinkFlow key={`link:${session.token}`} token={session.token} onExpired={onExpired}
        onCancel={selected ? () => setLinking(false) : undefined}
        onLinked={(sin) => {
          void api.households(session.token).then((households) => {
            begin({ ...session, households }, sin); setLinking(false); go("home");
          }).catch((err) => { if (err instanceof ApiError && err.status === 401) onExpired(); });
        }} />
    </main>;
  }

  const key = `${session.token}:${selected.sin}`;
  return (
    <div className="shell">
      <main>
        {sessionNotice && <p role="status" className="muted">{sessionNotice}</p>}
        {tab === "home" && <>
          <Home key={`home:${key}`} token={session.token} household={selected} onExpired={onExpired} onSave={() => go("missions")} />
          <BillHistory key={`history:${key}`} token={session.token} household={selected} onExpired={onExpired} renderExplanation={(r) => <BakitGanitoResult r={r} />} />
          {selected.meter_type === "smart" && <SmartMeterUsage key={`usage:${key}`} token={session.token} household={selected} onExpired={onExpired} />}
        </>}
        {tab === "missions" && (selected.meter_type === "traditional" ? <>
          <UsagePlan key={`plan:${key}:${applianceVersion}`} token={session.token} household={selected} onExpired={onExpired} />
          <Forecast key={`forecast:${key}`} token={session.token} household={selected} onExpired={onExpired} />
        </> : <section className="card"><h2>Missions</h2><p className="muted">Ang Missions para sa smart meter ay sinusukat din sa susunod na Bill.</p></section>)}
        {tab === "rewards" && <Rewards key={`rewards:${key}:${rewardsVersion}`} token={session.token} household={selected} onExpired={onExpired} onPointsChanged={() => setRewardsVersion((v) => v + 1)} />}
        {tab === "account" && <>
          <HouseholdPicker households={session.households} selected={selected.sin} onSelect={select} onLogout={() => {
            const token = session.token;
            end(null);
            void api.logout(token).catch((err) => {
              if (!(err instanceof ApiError && err.status === 401)) setSessionNotice("Hindi makumpirma ang logout sa server. Na-clear na ang session sa device na ito; mag-e-expire ang token sa loob ng isang oras.");
            });
          }} />
          <button type="button" className="ghost wide" onClick={() => setLinking(true)}>+ Link another Household</button>
          <Appliances key={`appliances:${key}`} token={session.token} household={selected} onExpired={onExpired} onSaved={() => setApplianceVersion((v) => v + 1)} />
        </>}
      </main>
      <TabBar tab={tab} />
    </div>
  );
}
