import { useEffect, useState } from "react";

export type EelioLoaderVariant = "bill" | "missions" | "setup" | "rewards" | "appliances" | "meter" | "session";

interface EelioLoaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  variant?: EelioLoaderVariant;
  steps?: readonly string[];
  /** Optional real progress (0–100) driven by completed network requests. */
  progress?: number;
  /** Optional active step index driven by completed network requests. */
  activeStep?: number;
  compact?: boolean;
  role?: "status";
}

const SWIM_FRAMES = [1, 2, 3, 4, 5, 6] as const;

const DEFAULT_STEPS: Record<EelioLoaderVariant, readonly string[]> = {
  bill: [
    "Checking your kWh usage and billing days",
    "Comparing rate and weather shifts vs. last month",
    "Breaking down pass-through and Meralco charges",
  ],
  missions: [
    "Reviewing your household appliances and routine",
    "Estimating kWh and peso savings for each habit",
    "Building your personalized 5% mission plan",
  ],
  setup: [
    "Checking your household size and baseline",
    "Loading your appliance tap grid and routine",
    "Preparing your Welcome Points progress",
  ],
  rewards: [
    "Checking your Verified Savings history",
    "Counting your available and locked Points",
    "Loading partner sample rewards",
  ],
  appliances: [
    "Reading your saved household appliances",
    "Matching typical wattage to your bill's kWh",
    "Calculating each appliance's share of the bill",
  ],
  meter: [
    "Fetching smart meter interval readings",
    "Summing kWh across your selected time window",
    "Preparing your usage breakdown chart",
  ],
  session: [
    "Verifying your active session",
    "Reconnecting to your linked household",
    "Preparing your dashboard",
  ],
};

const ICON_PATH: Record<EelioLoaderVariant, string> = {
  bill: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6M8 8h4",
  missions: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  setup: "M13 2 4 14h7l-1 8 9-12h-7z",
  rewards: "M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z",
  appliances: "M9 2v6M15 2v6M5 8h14v5a7 7 0 0 1-14 0V8zM12 20v2",
  meter: "M3 12h4l3-8 4 16 3-8h4",
  session: "M13 2 4 14h7l-1 8 9-12h-7z",
};

/**
 * Dynamic, gamified Eelio loading state used while a module's data is being fetched.
 * Unmounts immediately as soon as the parent module's data resolves.
 */
export function EelioLoader({
  title,
  subtitle,
  badge = "Eelio at work",
  variant = "session",
  steps,
  progress,
  activeStep,
  compact = false,
  role,
}: EelioLoaderProps) {
  const activeSteps = steps && steps.length > 0 ? steps : (subtitle ? [subtitle, ...DEFAULT_STEPS[variant]] : DEFAULT_STEPS[variant]);
  const [internalStep, setInternalStep] = useState(0);
  const [internalCharge, setInternalCharge] = useState(progress ?? 24);

  useEffect(() => {
    if (progress !== undefined) {
      setInternalCharge((prev) => Math.max(prev, Math.min(98, Math.round(progress))));
    }
  }, [progress]);

  useEffect(() => {
    const stepTimer = window.setInterval(() => {
      setInternalStep((i) => Math.min(i + 1, activeSteps.length - 1));
    }, 650);
    const chargeTimer = window.setInterval(() => {
      setInternalCharge((c) => {
        const floor = progress !== undefined ? Math.min(98, Math.round(progress)) : 24;
        const base = Math.max(c, floor);
        if (base >= 94) return base;
        return base + Math.max(1, Math.round((95 - base) * 0.14));
      });
    }, 180);
    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(chargeTimer);
    };
  }, [variant, activeSteps.length, progress]);

  const resolvedStep = activeStep !== undefined
    ? Math.max(internalStep, Math.min(activeStep, activeSteps.length - 1))
    : internalStep;
  const resolvedCharge = progress !== undefined
    ? Math.max(internalCharge, Math.min(98, Math.round(progress)))
    : internalCharge;
  const currentLine = activeSteps[resolvedStep] ?? subtitle ?? "";

  return (
    <div className={`eelio-loader variant-${variant}${compact ? " compact" : ""}`} role={role}>
      <div className="eelio-loader-stage" aria-hidden="true">
        <div className="eelio-loader-glow" />
        <svg className="eelio-loader-orbit" viewBox="0 0 180 180" fill="none">
          <circle cx="90" cy="90" r="72" className="eelio-orbit-ring" />
          <circle cx="90" cy="90" r="56" className="eelio-orbit-ring inner" />
        </svg>
        <div className="eelio-loader-trail" />
        <div className="eelio-loader-bob">
          {SWIM_FRAMES.map((n) => (
            <img
              key={`loader-swim-${n}`}
              src={`/mascot/eelio-swim-${n}.png`}
              alt=""
              className={`eelio-loader-frame swim-frame-${n}`}
            />
          ))}
        </div>
      </div>

      <div className="eelio-loader-copy">
        {badge && (
          <span className="eelio-loader-badge" aria-hidden="true">
            <svg
              className="eelio-loader-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={ICON_PATH[variant]} />
            </svg>
            <span>{badge}</span>
          </span>
        )}
        <p className="eelio-loader-title">{title}</p>
        {currentLine && (
          <p key={resolvedStep} className="eelio-loader-sub" aria-hidden="true">
            {currentLine}
          </p>
        )}

        <div className="eelio-loader-progress" aria-hidden="true">
          <div className="eelio-loader-meter-head">
            <span className="eelio-loader-step-dots">
              {activeSteps.map((_, idx) => (
                <span key={idx} className={`eelio-step-dot${idx <= resolvedStep ? " on" : ""}`} />
              ))}
            </span>
            <span className="eelio-loader-pct">{resolvedCharge}% charged</span>
          </div>
          <div className="eelio-loader-meter">
            <span className="eelio-loader-fill" style={{ width: `${resolvedCharge}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
