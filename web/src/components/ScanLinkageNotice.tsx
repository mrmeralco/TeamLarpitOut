import { useEffect, useState } from "react";
import { api, ApiError, type ScanLinkage } from "../api";
import { maskSin } from "../format";

export function ScanLinkageNotice({ token, now, before, onExpired, onSelect }: {
  token: string; now?: string; before?: string; onExpired: () => void; onSelect: (sin: string) => void;
}) {
  const [results, setResults] = useState<ScanLinkage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const refs = [...new Set([now, before].filter((r): r is string => Boolean(r)))];
    setResults(null); setError(null);
    void Promise.all(refs.map((ref) => api.scanLinkage(token, ref, controller.signal))).then((out) => {
      if (active) setResults(out);
    }).catch((err) => {
      if (!active) return;
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(err instanceof Error ? err.message : "Hindi ma-check ang link. Quick verdict muna.");
    });
    return () => { active = false; controller.abort(); };
  }, [token, now, before, onExpired]);
  const linked = results?.filter((r): r is Extract<ScanLinkage, { status: "linked" }> => r.status === "linked");
  const same = linked?.length === results?.length && linked?.length && new Set(linked.map((r) => r.householdSin)).size === 1;
  return <section className="card notice" aria-live="polite">
    <h2>Link ng na-scan na Bill</h2>
    {error ? <p>{error}</p> : !results ? <p>Chine-check ang naka-link na Household…</p> :
      results.some((r) => r.status === "unlinked") ? <p>Hindi naka-link ang account na ito sa My Meralco mo. Quick verdict lang para sa na-scan na Bill; walang Bill History na mabubuksan mula rito.</p> :
      results.some((r) => r.status === "unknown") ? <p>Hindi mabasa ang buong Service ID Number. Quick verdict lang muna; i-scan ulit para ma-check ang link.</p> :
      same ? <><p>Naka-link sa Household {maskSin(linked![0]!.householdSin)}. Hindi awtomatikong sine-save ang Bill.</p><button className="ghost" onClick={() => onSelect(linked![0]!.householdSin)}>Tingnan ang Bill History ng Household na ito</button></> :
      <p>Magkaibang Household ang dalawang na-scan na Bill. Hindi sila iuugnay sa iisang Household. Quick verdict lang muna.</p>}
  </section>;
}
