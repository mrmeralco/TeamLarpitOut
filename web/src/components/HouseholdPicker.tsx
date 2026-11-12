import type { Household } from "../api/client";
import { maskSin } from "../lib/format";

export function HouseholdPicker({ households, selected, onSelect, onLogout }: {
  households: Household[]; selected: string; onSelect: (sin: string) => void; onLogout: () => void;
}) {
  return <section className="card">
    <div className="card-head"><h2>Mga Household mo</h2><button className="ghost" onClick={onLogout}>Mag-logout</button></div>
    {households.length ? <label>Piliin ang Household
      <select value={selected} onChange={(e) => onSelect(e.target.value)}>
        <option value="">Pumili…</option>
        {households.map((h) => <option key={h.sin} value={h.sin}>
          {maskSin(h.sin)} · {h.masked_address} · {h.meter_type === "smart" ? "Smart meter" : "Traditional meter"}
        </option>)}
      </select>
    </label> : <p>Walang naka-link na Household sa My Meralco login na ito.</p>}
  </section>;
}
