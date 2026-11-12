import { useEffect, useRef } from "react";
import type { Household, SetupStatus } from "../api/client";
import type { Tab } from "../lib/routes";
import { SaveIntro } from "./SaveIntro";
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
    hint: "Tap the appliances you have. Eelio will match typical consumption.",
  },
  routine: {
    step: 3,
    charge: 95,
    mascot: "/mascot/eelio-hero.png",
    subtitle: "Daily Routine",
    hint: "Two quick picks to align Eelio's energy savings with your schedule.",
  },
};

/**
 * Missions tab: the setup checklist until Household Setup is complete (#51), then the plan.
 * `#/missions/save` is the rewards onboarding; `#/missions/setup/<step>` opens the step modal.
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
  if (!setup) return <section className="card"><p className="muted" role="status">Loading setup…</p></section>;
  const toChecklist = () => go("missions");
  const nextStep = (s: SetupStatus) => s.steps.find((x) => !x.done)?.key;
  const advance = (s: SetupStatus) => {
    onSetup(s);
    const next = nextStep(s);
    if (s.complete || !next) go("missions");
    else go("missions", "setup", next);
  };

  const isSetupModal = sub[0] === "setup" && (sub[1] === "household" || sub[1] === "appliances" || sub[1] === "routine");
  const dialogRef = useRef<HTMLDivElement>(null);
  const meta = STEP_META[sub[1]] ?? {
    step: 1,
    charge: 33,
    mascot: "/mascot/eelio-hero.png",
    subtitle: "Setup",
    hint: "Complete your home setup to unlock missions.",
  };

  useEffect(() => {
    if (!isSetupModal) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toChecklist();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSetupModal]);

  if (sub[0] === "save") {
    return <SaveIntro onLater={() => go("home")} onStart={() => {
      const next = nextStep(setup);
      if (setup.complete || !next) go("missions"); else go("missions", "setup", next);
    }} />;
  }

  let stepModalNode: React.ReactNode = null;
  if (isSetupModal) {
    if (sub[1] === "household") {
      stepModalNode = <SetupHousehold token={token} sin={household.sin} status={setup} onSaved={advance} onBack={toChecklist} onExpired={onExpired} />;
    } else if (sub[1] === "routine") {
      stepModalNode = <SetupRoutine token={token} sin={household.sin} status={setup} onSaved={advance} onBack={toChecklist} onExpired={onExpired} agreement={routineAgreement} />;
    } else if (sub[1] === "appliances") {
      stepModalNode = appliancesStep ? <>{appliancesStep(advance, toChecklist)}</> : (
        <section className="flow">
          <div className="card-head">
            <button type="button" className="back" aria-label="Back" onClick={toChecklist}>‹</button>
            <span className="muted small">Setup 2 of 3</span>
          </div>
          <h2>Tap the appliances you have</h2>
          <p className="muted">List your appliances under Account → Appliances, then come back here.</p>
          <button type="button" className="primary" onClick={() => go("account")}>Go to appliances</button>
        </section>
      );
    }
  }

  const modal = isSetupModal && stepModalNode ? (
    <div
      className="setup-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your home"
      onClick={(e) => { if (e.target === e.currentTarget) toChecklist(); }}
    >
      <div className="setup-modal-sheet" tabIndex={-1} ref={dialogRef}>
        <div className="setup-modal-hero">
          <div className="setup-modal-hero-top">
            <span className="setup-step-badge">
              <span className="badge-dot" aria-hidden="true" />
              Step {meta.step} of 3 · {meta.subtitle}
            </span>
            <button
              type="button"
              className="setup-modal-close"
              aria-label="Close setup modal"
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
              <div className="setup-modal-charge">
                <div className="setup-charge-label">
                  <span>Battery charge</span>
                  <strong>{meta.charge}%</strong>
                </div>
                <div className="setup-charge-track">
                  <div className="setup-charge-bar" style={{ width: `${meta.charge}%` }} />
                </div>
              </div>
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
        <SetupChecklist status={setup} onIntro={() => go("missions", "save")} onStep={(key) => go("missions", "setup", key)} />
        {modal}
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
