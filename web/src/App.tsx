import { useCallback, useEffect, useState } from "react";
import { api, ApiError, setupApi, type HomeChargeLine, type Household, type LoginResult, type SetupStatus } from "./api/client";
import { MissionsTab } from "./components/MissionsTab";
import { SetupAppliances } from "./components/SetupAppliances";
import { AirconAgreement } from "./components/AirconAgreement";
import { ChargeChat } from "./components/ChargeChat";
import { AuthFlow, CreatePassword } from "./components/auth/AuthScreens";
import { AuthLayout } from "./components/auth/AuthLayout";
import { ScanBill } from "./components/ScanBill";
import { HouseholdPicker } from "./components/HouseholdPicker";
import { SmartMeterUsage } from "./components/SmartMeterUsage";
import { Appliances } from "./components/Appliances";
import { MissionPlan, PlanSummaryCard } from "./components/MissionPlan";
import { Home } from "./components/Home";
import { Rewards } from "./components/Rewards";
import { TabBar } from "./components/TabBar";
import { stored, useHashRoute, useRawHash } from "./lib/routes";

const EXPIRED = "Your session expired. Please sign in again.";

/**
 * Signed out: sign-in → code → link CAN → scan → "Is this right?", one screen at a time.
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
  const [asking, setAsking] = useState<{ line: HomeChargeLine; previousMonth: string | null } | null>(null);
  const [route, go] = useHashRoute();
  const rawHash = useRawHash();
  const tab = route.tab;
  const [setup, setSetup] = useState<SetupStatus | null>(null);

  const begin = useCallback((next: LoginResult, preferSin?: string) => {
    setSession(next);
    stored.set("token", next.token);
    const sin = next.households.find((h) => h.sin === preferSin)?.sin ?? next.households[0]?.sin ?? "";
    setSelectedSin(sin);
    stored.set("household", sin || null);
  }, []);
  const end = useCallback((notice: string | null) => {
    setSession(null); setSelectedSin(""); setLinking(false); setAsking(null); setSessionNotice(notice);
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

  // Household Setup decides the Missions tab and the Home save card; reloaded per Household.
  const setupKey = session && selectedSin ? `${session.token}:${selectedSin}` : null;
  useEffect(() => {
    setSetup(null);
    if (!session || !selectedSin) return;
    const controller = new AbortController();
    setupApi.status(session.token, selectedSin, controller.signal).then(setSetup).catch((err) => {
      if (!controller.signal.aborted && err instanceof ApiError && err.status === 401) onExpired();
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupKey]);
  /** After appliances change elsewhere (Account), re-read setup without blanking the Missions tab. */
  const refreshSetup = () => {
    if (!session || !selectedSin) return;
    setupApi.status(session.token, selectedSin).then(setSetup).catch((err) => { if (err instanceof ApiError && err.status === 401) onExpired(); });
  };

  const select = (sin: string) => { setSelectedSin(sin); setAsking(null); stored.set("household", sin); };
  const selected: Household | undefined = session?.households.find((h) => h.sin === selectedSin);

  if (restoring) return <main className="flow-screen"><p className="muted" role="status">Opening…</p></main>;

  /** A new session: load its Households, then Home (or the bill scan when none is linked yet). */
  const signedIn = (token: string) => {
    setSessionNotice(null);
    api.households(token).then((households) => { begin({ token, households }); go("home"); })
      .catch(() => setSessionNotice("We couldn't load your account. Please try again."));
  };

  if (!session) {
    const createPassword = /^#\/create-password\/([A-Za-z0-9_-]{43})$/.exec(rawHash);
    return <main className="auth-main"><AuthLayout>
      {createPassword
        ? <CreatePassword token={createPassword[1]!} onDone={signedIn} onBack={() => { window.location.hash = "/signup"; }} />
        : <AuthFlow initial={rawHash === "#/signin" || sessionNotice ? "signin" : "signup"} notice={sessionNotice} onSignedIn={signedIn} />}
    </AuthLayout></main>;
  }

  if (linking || !selected) {
    return <main className="auth-main"><AuthLayout>
      <ScanBill key={`link:${session.token}`} token={session.token} onExpired={onExpired}
        onBack={selected ? () => setLinking(false) : undefined}
        onLinked={(sin) => {
          void api.households(session.token).then((households) => {
            begin({ ...session, households }, sin); setLinking(false); go("home");
          }).catch((err) => { if (err instanceof ApiError && err.status === 401) onExpired(); });
        }} />
    </AuthLayout></main>;
  }

  const key = `${session.token}:${selected.sin}`;
  return (
    <div className="shell">
      <main>
        {sessionNotice && <p role="status" className="muted">{sessionNotice}</p>}
        {tab === "home" && <>
          <Home key={`home:${key}`} token={session.token} household={selected} onExpired={onExpired} onSave={() => go("missions", "save")}
            saveCard={setup?.complete ? <PlanSummaryCard token={session.token} sin={selected.sin} onOpen={() => go("missions")} /> : undefined}
            setup={setup}
            onAskCharge={(line, summary) => setAsking({
              line,
              previousMonth: summary.bakitGanito ? new Date(`${summary.bakitGanito.previousPeriod}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long" }) : null,
            })} />
          {asking && <ChargeChat key={`chat:${key}:${asking.line.id}`} token={session.token} sin={selected.sin} line={asking.line}
            previousMonth={asking.previousMonth} onClose={() => setAsking(null)} onExpired={onExpired} />}
          {selected.meter_type === "smart" && <SmartMeterUsage key={`usage:${key}`} token={session.token} household={selected} onExpired={onExpired} />}
        </>}
        {tab === "missions" && <MissionsTab token={session.token} household={selected} sub={route.sub} go={go}
          setup={setup} onSetup={(s) => { setSetup(s); setApplianceVersion((v) => v + 1); }} onExpired={onExpired}
          appliancesStep={(done, back) => setup && <SetupAppliances token={session.token} sin={selected.sin} status={setup} onSaved={done} onBack={back} onExpired={onExpired} />}
          routineAgreement={(aircon) => <AirconAgreement token={session.token} sin={selected.sin} aircon={aircon} />}>
          <MissionPlan key={`plan:${key}:${applianceVersion}`} token={session.token} household={selected} onExpired={onExpired}
            missionId={route.sub[0] === "m" ? route.sub[1] : undefined} onOpen={(id) => go("missions", "m", id)} onBack={() => go("missions")} />
        </MissionsTab>}
        {tab === "rewards" && <Rewards key={`rewards:${key}:${rewardsVersion}`} token={session.token} household={selected} onExpired={onExpired} onPointsChanged={() => setRewardsVersion((v) => v + 1)} />}
        {tab === "account" && <>
          <HouseholdPicker households={session.households} selected={selected.sin} onSelect={select} onLogout={() => {
            const token = session.token;
            end(null);
            window.location.hash = "/signin";
            void api.logout(token).catch((err) => {
              if (!(err instanceof ApiError && err.status === 401)) setSessionNotice("We couldn't confirm the logout with the server. The session is cleared on this device; the token expires within an hour.");
            });
          }} />
          <button type="button" className="ghost wide" onClick={() => setLinking(true)}>+ Link another Household</button>
          <Appliances key={`appliances:${key}`} token={session.token} household={selected} onExpired={onExpired} onSaved={() => { setApplianceVersion((v) => v + 1); refreshSetup(); }} />
        </>}
      </main>
      <TabBar tab={tab} />
    </div>
  );
}
