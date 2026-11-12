import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type LoginResult } from "./api/client";
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

/** Sign-in comes first; every Bill explanation comes from a linked Household (ADR-0005). */
export function App() {
  const [session, setSession] = useState<LoginResult | null>(null);
  const [selectedSin, setSelectedSin] = useState("");
  /** Bumped when appliances are saved so Missions are recomputed. */
  const [applianceVersion, setApplianceVersion] = useState(0);
  const [rewardsVersion, setRewardsVersion] = useState(0);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const selected = session?.households.find((h) => h.sin === selectedSin);
  const onExpired = useCallback(() => {
    setSession(null); setSelectedSin(""); setSessionNotice("Nag-expire ang session. Mag-sign in ulit.");
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(onExpired, 60 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [session, onExpired]);

  return (
    <main>
      <header>
        <h1>KuryenteKo</h1>
        <p>Bakit ganito ang bill ko?</p>
      </header>

      {sessionNotice && <p role="status" className="muted">{sessionNotice}</p>}
      {!session && <SignIn onLogin={(next) => { setSession(next); setSelectedSin(""); setSessionNotice(null); }} />}
      {session && (linking || session.households.length === 0) && <LinkFlow key={`link:${session.token}`} token={session.token} onExpired={onExpired}
        onCancel={session.households.length ? () => setLinking(false) : undefined}
        onLinked={(sin) => {
          void api.households(session.token).then((households) => {
            setSession({ ...session, households }); setSelectedSin(sin); setLinking(false);
          }).catch((err) => { if (err instanceof ApiError && err.status === 401) onExpired(); });
        }} />}
      {session && !linking && session.households.length > 0 && <>
        <button type="button" className="ghost" onClick={() => setLinking(true)}>+ Mag-link ng Household</button>
        <HouseholdPicker households={session.households} selected={selectedSin} onSelect={setSelectedSin} onLogout={() => {
          const token = session.token;
          setSession(null); setSelectedSin(""); setSessionNotice(null);
          void api.logout(token).catch((err) => {
            if (!(err instanceof ApiError && err.status === 401)) setSessionNotice("Hindi makumpirma ang logout sa server. Na-clear na ang session sa device na ito; mag-e-expire ang token sa loob ng isang oras.");
          });
        }} />
      </>}
      {session && selected && <Home key={`home:${session.token}:${selected.sin}`} token={session.token} household={selected} onExpired={onExpired} />}
      {session && selected && <BillHistory key={`${session.token}:${selected.sin}`} token={session.token} household={selected} onExpired={onExpired} renderExplanation={(r) => <BakitGanitoResult r={r} />} />}
      {session && selected?.meter_type === "smart" && <SmartMeterUsage key={`usage:${session.token}:${selected.sin}`} token={session.token} household={selected} onExpired={onExpired} />}
      {session && selected && <Appliances key={`appliances:${session.token}:${selected.sin}`} token={session.token} household={selected} onExpired={onExpired} onSaved={() => setApplianceVersion((v) => v + 1)} />}
      {session && selected && selected.meter_type === "traditional" && (
        <>
          <UsagePlan key={`plan:${session.token}:${selected.sin}:${applianceVersion}`} token={session.token} household={selected} onExpired={onExpired} />
          <Forecast key={`forecast:${session.token}:${selected.sin}`} token={session.token} household={selected} onExpired={onExpired} />
        </>
      )}
      {session && selected && (
        <Rewards key={`rewards:${session.token}:${selected.sin}:${rewardsVersion}`} token={session.token} household={selected} onExpired={onExpired} onPointsChanged={() => setRewardsVersion((v) => v + 1)} />
      )}
    </main>
  );
}
