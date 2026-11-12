import type { SetupStatus } from "../api/client";

const HOME_TEXT: Record<string, string> = { allDay: "home almost all day", eveningsWeekends: "home most evenings", daytime: "home mostly daytime" };
const STEP_TEXT: Record<SetupStatus["steps"][number]["key"], { title: string; hint: string }> = {
  household: { title: "Your household", hint: "How many people live there" },
  appliances: { title: "Tap the appliances you have", hint: "No photos or wattage needed" },
  routine: { title: "Pick your daily routine", hint: "Two quick choices for the whole home" },
};

/** The locked state of the Missions tab (mockup screen 9): a persistent checklist, never a dismissable dialog. */
export function SetupChecklist({ status, onStep, onIntro, smart = false }: {
  status: SetupStatus;
  /** Smart meter homes earn daily, not at the next bill (ADR-0008). */
  smart?: boolean;
  onStep: (key: SetupStatus["steps"][number]["key"]) => void;
  onIntro: () => void;
}) {
  return (
    <section className="setup" aria-labelledby="setup-title">
      <span className="muted small">Manage your usage</span>
      <h2 id="setup-title">Save on next month's bill and get rewarded</h2>
      <p className="muted small">Every ₱1 you save, verified {smart ? "every day by your smart meter" : "on your next bill"}, earns 1 point you can redeem for load, e-wallet credit and vouchers. <button type="button" className="link" onClick={onIntro}>How it works</button></p>
      <div className="card setup-card">
        <div className="card-head">
          <div>
            <h3>Set up your home</h3>
            <span className="muted small">{status.doneCount} of {status.total} complete · about 2 minutes</span>
          </div>
          <span className="pts">+{status.welcomePoints.points} pts</span>
        </div>
        <div className="progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={status.total} aria-valuenow={status.doneCount}>
          <span style={{ width: `${(status.doneCount / status.total) * 100}%` }} />
        </div>
        <ol className="checklist">
          {status.steps.map((s, i) => (
            <li key={s.key}>
              <button type="button" className={`check-step ${s.done ? "done" : ""}`} onClick={() => onStep(s.key)}>
                <span className="step-n" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                <span>
                  <strong>{STEP_TEXT[s.key].title}</strong>
                  <span className="muted small">{s.key === "household" && status.household
                    ? `${status.household.size} ${status.household.size === 1 ? "person" : "people"}${status.routine ? ` · ${HOME_TEXT[status.routine.home]}` : ""}`
                    : STEP_TEXT[s.key].hint}</span>
                </span>
                <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="muted small">Welcome points appear in your balance right away and unlock after your first verified savings.</p>
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
    </section>
  );
}
