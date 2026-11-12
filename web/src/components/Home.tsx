import { useEffect, useState } from "react";
import { ApiError, homeApi, type Household, type HomeSummary } from "../api/client";
import { monthLabel, peso } from "../lib/format";

const BADGE_ICON: Record<HomeSummary["badge"]["status"], string> = { green: "🟢", yellow: "🟡", red: "🔴" };

const dueDateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

/** Scroll to a section of the page; returns false when that section isn't shown. */
function goTo(screen: string): boolean {
  const el = document.getElementById(screen);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function Card(props: { title: string; screen: string; children: React.ReactNode }) {
  const [missing, setMissing] = useState(false);
  return (
    <button type="button" className="home-card" onClick={() => setMissing(!goTo(props.screen))}>
      <span className="home-card-title">{props.title}</span>
      <span className="home-card-body">{props.children}</span>
      <span className="home-card-link" aria-hidden>
        {missing ? "Wala pa ito sa ibaba" : "Tingnan ›"}
      </span>
    </button>
  );
}

/** Home: pay-ready summary and the three questions. Parent keys it by session and SIN. */
export function Home({ token, household, onExpired }: { token: string; household: Household; onExpired: () => void }) {
  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    homeApi
      .summary(token, household.sin, controller.signal)
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) onExpired();
        else setError(err instanceof Error ? err.message : "Hindi makuha ang Home.");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, household.sin]);

  if (error) return <section className="card home"><p className="error" role="alert">{error}</p></section>;
  if (!data) return <section className="card home"><p className="muted">Kinukuha ang Bill…</p></section>;

  const action = data.action;
  async function copySummary() {
    if (action.kind !== "askMeralco") return;
    try {
      await navigator.clipboard.writeText(action.summary);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={`card home badge-${data.badge.status}`} aria-live="polite">
      <div className="home-due">
        <span className="muted">Bill ng {monthLabel(data.bill.period)}</span>
        <strong className="home-amount">{data.bill.amountDue === null ? "—" : peso(data.bill.amountDue)}</strong>
        <span className="muted">{data.bill.dueDate ? `Due sa ${dueDateLabel(data.bill.dueDate)}` : "Walang naka-print na due date"}</span>
        <span className={`home-badge ${data.badge.status}`}>
          {BADGE_ICON[data.badge.status]} {data.badge.label}
        </span>
      </div>

      {data.smartMeter && (
        <p className="muted">
          Ngayong buwan hanggang ngayon: {data.smartMeter.monthToDateKwh === null ? "darating kasama ang smart meter readings" : `${data.smartMeter.monthToDateKwh} kWh`}
        </p>
      )}

      <div className="home-cards">
        <Card title="Bakit ganito?" screen="bakit-ganito">
          {data.bakitGanito?.sentence ?? data.bakitGanitoUnavailable}
        </Card>
        <Card title="Tama ba ito?" screen="tama-ba">
          {data.tamaBa.failedChecks > 0
            ? `${data.tamaBa.label}: ${data.tamaBa.failedChecks} sa mga Bill Check ang hindi tugma.`
            : `${data.tamaBa.label}: pasado ang mga Bill Check na kayang gawin.`}
        </Card>
        <Card title="Ano ang gagawin ko?" screen={action.screen}>
          {action.label}
        </Card>
      </div>

      {action.kind === "askMeralco" && (
        <div className="home-ask">
          <p className="muted">Ang app ay hindi nagfa-file ng reklamo. Kopyahin ang buod kung gusto mong magtanong sa Meralco.</p>
          <button type="button" className="ghost wide" onClick={copySummary}>
            {copied ? "Nakopya na ✓" : "Kopyahin ang buod"}
          </button>
        </div>
      )}
    </section>
  );
}
