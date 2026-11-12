import { useEffect, useRef, useState } from "react";
import type { Household, SetupStatus } from "../api/client";
import type { Tab } from "../lib/routes";
import { setupApi } from "../api/client";
import { EelioLoader } from "./EelioLoader";
import { MissionsOnboarding } from "./MissionsOnboarding";
import { SetupChecklist } from "./SetupChecklist";
import { SetupHousehold } from "./SetupHousehold";
import { SetupRoutine } from "./SetupRoutine";

const STEP_META: Record<string, { step: number; charge: number; mascot: string; subtitle: string; hint: string }> = {
  household: {
    step: 1,
    charge: 33,
    mascot: "/mascot/eelio-hero.png",
    subtitle: "Household Baseline",
    hint: "How many people live there? Eelio is ready to calculate normal usage.",
  },
  appliances: {
    step: 2,
    charge: 66,
    mascot: "/mascot/eelio-detective.png",
    subtitle: "Appliance Grid",
    hint: "Tap the appliances you have, or snap a photo so Eelio can estimate its size.",
  },
  routine: {
    step: 3,
    charge: 95,
    mascot: "/mascot/eelio-hero.png",
    subtitle: "Daily Routine",
    hint: "Two quick picks to align Eelio's energy savings with your schedule.",
  },
};

/** Eelio's line on a step opened after setup is complete, to change an answer. */
const EDIT_HINT: Record<string, string> = {
  household: "Someone moved in or out? Update it and Eelio recalculates.",
  appliances: "Changed something at home? Update the grid and Eelio refreshes your missions.",
  routine: "New schedule? Update your typical day and Eelio refreshes your missions.",
};

/**
 * Missions tab: the setup checklist until Household Setup is complete (#51), then the plan.
 * Eelio's onboarding opens on its own the first time (setup not started), and at `#/missions/save`
 * ("How it works", or "Want to save?" in the bill's Wrapped); `#/missions/setup/<step>` opens a step.
 * After setup, the same route edits a step; `#/missions/setup/<step>/home` returns to Home when done.
 */
export function MissionsTab({ token, household, sub, go, setup, onSetup, onExpired, appliancesStep, routineAgreement, children }: {
  token: string;
  household: Household;
  sub: string[];
  go: (tab: Tab, ...sub: string[]) => void;
  setup: SetupStatus | null;
  onSetup: (s: SetupStatus) => void;
  onExpired: () => void;
  /** The appliance step screen (tap grid, #52); `editing` once setup is complete. */
  appliancesStep?: (done: (s: SetupStatus) => void, back: () => void, editing: boolean) => React.ReactNode;
  routineAgreement?: (aircon: import("../api/client").AirconPattern) => React.ReactNode;
  /** The Mission Plan, shown once setup is complete. */
  children: React.ReactNode;
}) {
  const [autoOnboard, setAutoOnboard] = useState(true);
  // Editing after setup can start on Home (the appliances card); closing or saving goes back there.
  const fromHome = sub[0] === "setup" && sub[2] === "home";
  const toChecklist = () => (fromHome && setup?.complete ? go("home") : go("missions"));
  const isSetupModal = sub[0] === "setup" && (sub[1] === "household" || sub[1] === "appliances" || sub[1] === "routine");
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isSetupModal) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toChecklist();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSetupModal]);
  if (!setup) {
    return (
      <section className="dash loading" aria-busy="true">
        <EelioLoader
          variant="setup"
          badge="Home Setup"
          title="Loading setup…"
          role="status"
        />
      </section>
    );
  }
  const nextStep = (s: SetupStatus) => s.steps.find((x) => !x.done)?.key;
  const advance = (s: SetupStatus) => {
    onSetup(s);
    // After setup this is only ever the routine step, when an edit added an aircon without a schedule:
    // ask for it now, or the aircon would count zero hours.
    const next = nextStep(s);
    if (next) go("missions", "setup", next, ...(fromHome ? ["home"] : []));
    else if (fromHome && s.complete) go("home");
    else go("missions");
  };

  const editing = setup.complete;
  const baseMeta = STEP_META[sub[1]] ?? {
    step: 1,
    charge: 33,
    mascot: "/mascot/eelio-hero.png",
    subtitle: "Setup",
    hint: "Complete your home setup to unlock missions.",
  };
  const meta = editing ? { ...baseMeta, hint: EDIT_HINT[sub[1]] ?? baseMeta.hint } : baseMeta;


  const showOnboarding = !setup.complete && (sub[0] === "save" || (autoOnboard && !setup.onboardingSeen && setup.doneCount === 0 && sub[0] !== "setup"));
  const closeOnboarding = (start: boolean) => {
    setAutoOnboard(false);
    // Remembered on the server, so it shows once per Household on any device.
    if (!setup.onboardingSeen) {
      setupApi.onboardingSeen(token, household.sin).then(onSetup).catch((err) => { if (err?.status === 401) onExpired(); });
    }
    const next = nextStep(setup);
    if (start && next) go("missions", "setup", next); else go("missions");
  };
  const onboardingNode = showOnboarding
    ? <MissionsOnboarding smart={household.meter_type === "smart"} welcomePoints={setup.welcomePoints.points} onStart={() => closeOnboarding(true)} onLater={() => closeOnboarding(false)} />
    : null;

  let stepModalNode: React.ReactNode = null;
  if (isSetupModal) {
    if (sub[1] === "household") {
      stepModalNode = <SetupHousehold token={token} sin={household.sin} status={setup} onSaved={advance} onBack={toChecklist} onExpired={onExpired} />;
    } else if (sub[1] === "routine") {
      stepModalNode = <SetupRoutine token={token} sin={household.sin} status={setup} onSaved={advance} onBack={toChecklist} onExpired={onExpired} agreement={routineAgreement} />;
    } else if (sub[1] === "appliances") {
      stepModalNode = appliancesStep ? <>{appliancesStep(advance, toChecklist, editing)}</> : null;
    }
  }

  const modal = isSetupModal && stepModalNode ? (
    <div
      className="setup-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit your home" : "Set up your home"}
      onClick={(e) => { if (e.target === e.currentTarget) toChecklist(); }}
    >
      <div className="setup-modal-sheet" tabIndex={-1} ref={dialogRef}>
        <div className="setup-modal-hero">
          <div className="setup-modal-hero-top">
            <span className="setup-step-badge">
              <span className="badge-dot" aria-hidden="true" />
              {editing ? `Edit · ${meta.subtitle}` : `Step ${meta.step} of 3 · ${meta.subtitle}`}
            </span>
            <button
              type="button"
              className="setup-modal-close"
              aria-label={editing ? "Close" : "Close setup modal"}
              onClick={toChecklist}
            >
              ×
            </button>
          </div>
          <div className="setup-modal-hero-main">
            <img src={meta.mascot} alt="Eelio" className="setup-modal-mascot" />
            <div className="setup-modal-hero-text">
              <div className="setup-modal-bubble">
                <span className="bubble-speaker">Eelio says</span>
                <p>{meta.hint}</p>
              </div>
              {!editing && <div className="setup-modal-charge">
                <div className="setup-charge-label">
                  <span>Battery charge</span>
                  <strong>{meta.charge}%</strong>
                </div>
                <div className="setup-charge-track">
                  <div className="setup-charge-bar" style={{ width: `${meta.charge}%` }} />
                </div>
              </div>}
            </div>
          </div>
        </div>
        <div className="setup-modal-body">
          {stepModalNode}
        </div>
      </div>
    </div>
  ) : null;

  if (!setup.complete) {
    return (
      <>
        <SetupChecklist status={setup} smart={household.meter_type === "smart"} onIntro={() => go("missions", "save")} onStep={(key) => go("missions", "setup", key)} />
        {modal}
        {onboardingNode}
      </>
    );
  }
  return (
    <>
      {children}
      {modal}
    </>
  );
}
