import type { Household, SetupStatus } from "../api/client";
import type { Tab } from "../lib/routes";
import { SaveIntro } from "./SaveIntro";
import { SetupChecklist } from "./SetupChecklist";
import { SetupHousehold } from "./SetupHousehold";
import { SetupRoutine } from "./SetupRoutine";

/**
 * Missions tab: the setup checklist until Household Setup is complete (#51), then the plan.
 * `#/missions/save` is the rewards onboarding; `#/missions/setup/<step>` a setup screen.
 */
export function MissionsTab({ token, household, sub, go, setup, onSetup, onExpired, appliancesStep, routineAgreement, children }: {
  token: string;
  household: Household;
  sub: string[];
  go: (tab: Tab, ...sub: string[]) => void;
  setup: SetupStatus | null;
  onSetup: (s: SetupStatus) => void;
  onExpired: () => void;
  /** The appliance step screen (tap grid, #52). */
  appliancesStep?: (done: (s: SetupStatus) => void, back: () => void) => React.ReactNode;
  routineAgreement?: (aircon: import("../api/client").AirconPattern) => React.ReactNode;
  /** The Mission Plan, shown once setup is complete. */
  children: React.ReactNode;
}) {
  if (!setup) return <section className="card"><p className="muted" role="status">Kinukuha ang setup…</p></section>;
  const toChecklist = () => go("missions");
  const nextStep = (s: SetupStatus) => s.steps.find((x) => !x.done)?.key;
  const advance = (s: SetupStatus) => {
    onSetup(s);
    const next = nextStep(s);
    if (s.complete || !next) go("missions");
    else go("missions", "setup", next);
  };

  if (sub[0] === "save") {
    return <SaveIntro onLater={() => go("home")} onStart={() => {
      const next = nextStep(setup);
      if (setup.complete || !next) go("missions"); else go("missions", "setup", next);
    }} />;
  }
  if (sub[0] === "setup") {
    if (sub[1] === "household") return <SetupHousehold token={token} sin={household.sin} status={setup} onSaved={advance} onBack={toChecklist} onExpired={onExpired} />;
    if (sub[1] === "routine") return <SetupRoutine token={token} sin={household.sin} status={setup} onSaved={advance} onBack={toChecklist} onExpired={onExpired} agreement={routineAgreement} />;
    if (sub[1] === "appliances") {
      return appliancesStep ? <>{appliancesStep(advance, toChecklist)}</> : (
        <section className="flow">
          <button type="button" className="back" aria-label="Back" onClick={toChecklist}>‹</button>
          <h2>Tap the appliances you have</h2>
          <p className="muted">List your appliances under Account → Appliances, then come back here.</p>
          <button type="button" className="primary" onClick={() => go("account")}>Go to appliances</button>
        </section>
      );
    }
  }
  if (!setup.complete) {
    return <SetupChecklist status={setup} onIntro={() => go("missions", "save")} onStep={(key) => go("missions", "setup", key)} />;
  }
  return <>{children}</>;
}
