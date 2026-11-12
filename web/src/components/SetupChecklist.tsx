import type { SetupStatus } from "../api/client";
import { greeting } from "./HomeWrapped";

const HOME_TEXT: Record<string, string> = { allDay: "home almost all day", eveningsWeekends: "home most evenings", daytime: "home mostly daytime" };
const STEP_TEXT: Record<SetupStatus["steps"][number]["key"], { title: string; hint: string }> = {
  household: { title: "Your household", hint: "How many people live there" },
  appliances: { title: "Tap the appliances you have", hint: "No photos or wattage needed" },
  routine: { title: "Pick your daily routine", hint: "Two quick choices for the whole home" },
};

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="stars" role="img" aria-label={`${label}: ${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= value ? "on" : ""} aria-hidden="true">★</span>)}
    </span>
  );
}

const ICON = {
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  play: "M8 5v14l11-7z",
};
const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/**
 * The setup state of the Missions tab, fully gamified with Eelio in Low Battery state:
 * Hero card with sleepy Eelio, charge meter, 3 skills, checklist card, and locked preview sidebar.
 */
export function SetupChecklist({ status, onStep, onIntro, smart = false }: {
  status: SetupStatus;
  /** Smart meter homes earn daily, not at the next bill (ADR-0008). */
  smart?: boolean;
  onStep: (key: SetupStatus["steps"][number]["key"]) => void;
  onIntro: () => void;
}) {
  const chargePct = Math.round((status.doneCount / status.total) * 100);

  return (
    <section className="dash" aria-labelledby="setup-title">
      <div className="dash-main">
        {/* Eelio Hero Card (Active state, matching Home's hero) */}
        <div className="hero mood-charged">
          <div className="hero-copy">
            <p className="hero-hello">{greeting()} · Manage your usage</p>
            <h2 id="setup-title">Save on next month's bill and get rewarded</h2>
            <p className="hero-amount">
              +{status.welcomePoints.points} pts
              <span className="hero-change">Welcome Points</span>
            </p>
            <div className="hero-title">
              <span className="hero-title-icon"><Svg d={ICON.bolt} /></span>
              <span><span className="small">Eelio is</span><strong>Ready to Help</strong></span>
            </div>
            <div className="charge-meter" role="meter" aria-label="Eelio's charge" aria-valuemin={0} aria-valuemax={status.total} aria-valuenow={status.doneCount}>
              <span className="charge-track"><span style={{ width: `${chargePct}%` }} /></span>
              <span className="small">{chargePct}% charged</span>
            </div>
            <p className="hero-line">Eelio is ready to guide you. Complete home setup to charge Eelio to 100% and unlock your 5% missions.</p>
            <button type="button" className="hero-play" onClick={onIntro}>
              <Svg d={ICON.play} /> How it works
            </button>
          </div>
          <img className="hero-mascot" src="/mascot/eelio-hero.png" alt="Eelio, Ready to Help" />
        </div>

        {/* The Setup Checklist Card */}
        <div className="card setup-card">
          <div className="card-head">
            <div>
              <h3>Set up your home</h3>
              <span className="muted small">{status.doneCount} of {status.total} complete · about 2 minutes</span>
            </div>
            <span className="pts">+{status.welcomePoints.points} pts</span>
          </div>
          <div className="progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={status.total} aria-valuenow={status.doneCount}>
            <span style={{ width: `${chargePct}%` }} />
          </div>
          <ol className="checklist">
            {status.steps.map((s, i) => (
              <li key={s.key}>
                <button type="button" className={`check-step ${s.done ? "done" : ""}`} onClick={() => onStep(s.key)}>
                  <span className="step-n" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                  <span className="check-step-body">
                    <strong>{STEP_TEXT[s.key].title}</strong>
                    <span className="muted small">{s.key === "household" && status.household
                      ? `${status.household.size} ${status.household.size === 1 ? "person" : "people"}${status.routine ? ` · ${HOME_TEXT[status.routine.home]}` : ""}`
                      : STEP_TEXT[s.key].hint}</span>
                  </span>
                  <span className="check-step-arrow" aria-hidden="true">›</span>
                  <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="muted small" style={{ margin: "14px 0 0" }}>Welcome points appear in your balance right away.</p>
        </div>
      </div>

      {/* Side Column with Save Banner and Locked Missions Preview */}
      <aside className="dash-side" aria-label="Setup rewards info">
        <div className="save-card" style={{ cursor: "default" }}>
          <span>
            <strong>{smart ? "Earn points every day" : "Earn points on your next bill"}</strong>
            <span>Every mission is worth points: 1 point per ₱2 it saves, added {smart ? "each day your smart meter reads" : "when your next bill comes in"}, with a bonus in hot El Niño months. Redeem them for load, e-wallet credit and vouchers.</span>
          </span>
          <span aria-hidden="true">→</span>
        </div>

        <div className="card locked-preview" aria-label="Locked missions preview">
          <strong>🔒 Your missions unlock after setup</strong>
          <ul aria-hidden="true">
            <li>Turn off the aircon 1 hour earlier</li>
            <li>Iron clothes once a week</li>
            <li>Unplug chargers at night</li>
          </ul>
          <p className="muted small">Finish setup to unlock Missions.</p>
        </div>
      </aside>
    </section>
  );
}
