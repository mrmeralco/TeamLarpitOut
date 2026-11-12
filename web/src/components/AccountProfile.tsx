import { useState } from "react";
import type { Household, SetupStatus } from "../api/client";
import { maskSin } from "../lib/format";
import { stored } from "../lib/routes";

export interface HolderProfile {
  fullName: string;
  nickname: string;
  title: string;
  role: string;
  email: string;
  phone: string;
  billingPref: string;
}

const PROFILE_KEY = "holderProfile";

const TITLES = [
  "Energy Detective",
  "Watt Watcher",
  "Cool Master",
  "Eco Guardian",
  "Peak Dodger",
] as const;

const ROLES = [
  "Account Holder",
  "Head of Household",
  "Bill Manager",
  "Family Member",
] as const;

const DEFAULT_PROFILE: HolderProfile = {
  fullName: "Juan Dela Cruz",
  nickname: "Kuya Juan",
  title: "Energy Detective",
  role: "Account Holder",
  email: "juan.delacruz@gmail.com",
  phone: "+63 917 842 1094",
  billingPref: "Paperless e-Bill + Eelio Alerts",
};

function loadProfile(): HolderProfile {
  try {
    const raw = stored.get(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<HolderProfile>;
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function AccountProfile({
  households,
  selected,
  setup,
  onSelect,
  onLogout,
  onLink,
}: {
  households: Household[];
  selected: Household;
  setup: SetupStatus | null;
  onSelect: (sin: string) => void;
  onLogout: () => void;
  onLink: () => void;
}) {
  const [profile, setProfile] = useState<HolderProfile>(loadProfile);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HolderProfile>(profile);
  const [savedNote, setSavedNote] = useState(false);

  const doneSteps = setup?.doneCount ?? 0;
  const totalSteps = setup?.total ?? 3;
  const level = 1 + doneSteps + (households.length > 1 ? 1 : 0);
  const xp = Math.min(100, Math.round(((doneSteps + 1) / (totalSteps + 1)) * 100));
  const areaLabel = selected.masked_address.replace(/^•+\s*/, "") || "Metro Manila";
  const householdSize = setup?.household?.size;

  const startEdit = () => {
    setDraft(profile);
    setSavedNote(false);
    setEditing(true);
  };

  const saveEdit = () => {
    const cleaned: HolderProfile = {
      fullName: draft.fullName.trim() || DEFAULT_PROFILE.fullName,
      nickname: draft.nickname.trim() || DEFAULT_PROFILE.nickname,
      title: draft.title || DEFAULT_PROFILE.title,
      role: draft.role || DEFAULT_PROFILE.role,
      email: draft.email.trim() || DEFAULT_PROFILE.email,
      phone: draft.phone.trim() || DEFAULT_PROFILE.phone,
      billingPref: draft.billingPref.trim() || DEFAULT_PROFILE.billingPref,
    };
    setProfile(cleaned);
    stored.set(PROFILE_KEY, JSON.stringify(cleaned));
    setEditing(false);
    setSavedNote(true);
  };

  const badges = [
    {
      id: "holder",
      icon: "🏠",
      title: "Verified Bill Holder",
      detail: `Linked SIN ${maskSin(selected.sin)}`,
      unlocked: true,
    },
    {
      id: "meter",
      icon: selected.meter_type === "smart" ? "⚡" : "📟",
      title: selected.meter_type === "smart" ? "Smart Grid Pioneer" : "Classic Meter Pro",
      detail: selected.meter_type === "smart" ? "Real-time smart meter active" : "Monthly bill tracking active",
      unlocked: true,
    },
    {
      id: "setup",
      icon: "🛠️",
      title: "Home Profiler",
      detail: setup?.complete ? "All 3 home setup quests done" : `${doneSteps} of ${totalSteps} setup quests done`,
      unlocked: Boolean(setup?.complete),
    },
    {
      id: "multi",
      icon: "🌟",
      title: "Energy Captain",
      detail: `${households.length} linked ${households.length === 1 ? "household" : "households"} · ${areaLabel}`,
      unlocked: true,
    },
  ];

  return (
    <section className="dash account-dash" aria-label="Account profile">
      <div className="dash-main">
        <div className={`hero ${setup?.complete ? "mood-charged" : ""} account-hero`}>
          <div className="hero-copy">
            <p className="hero-hello">Holder Pass · Level {level} · {areaLabel}</p>
            <h2>{profile.role} · @{profile.nickname}</h2>
            <p className="hero-amount account-hero-name">
              {profile.fullName}
              <span className="hero-change">{profile.title}</span>
            </p>
            <div className="charge-meter" role="meter" aria-label="Profile XP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={xp}>
              <span className="charge-track"><span style={{ width: `${xp}%` }} /></span>
              <span className="small">{xp}% profile XP</span>
            </div>
            <p className="hero-line">
              {maskSin(selected.sin)} · {selected.meter_type === "smart" ? "Smart meter" : "Traditional meter"}
              {householdSize ? ` · ${householdSize} in household` : ""}
            </p>
            <button type="button" className="hero-play" onClick={editing ? saveEdit : startEdit}>
              {editing ? "✓ Save holder info" : "✎ Customize holder info"}
            </button>
          </div>
          <img
            className="hero-mascot"
            src={setup?.complete ? "/mascot/eelio-hero.png" : "/mascot/eelio-detective.png"}
            alt="Eelio companion"
          />
        </div>
      </div>

      <aside className="dash-side" aria-label="Your Households">
        <section className="card account-households-card">
          <div className="card-head">
            <h2>Your Households</h2>
            <button className="ghost" onClick={onLogout}>Log out</button>
          </div>
          <label>
            Choose a Household
            <select value={selected.sin} onChange={(e) => onSelect(e.target.value)}>
              {households.map((h) => (
                <option key={h.sin} value={h.sin}>
                  {maskSin(h.sin)} · {h.masked_address} · {h.meter_type === "smart" ? "Smart meter" : "Traditional meter"}
                </option>
              ))}
            </select>
          </label>
          <div className="account-meter-strip">
            <div>
              <span className="muted small">Service ID</span>
              <strong>{maskSin(selected.sin)}</strong>
            </div>
            <div>
              <span className="muted small">Location</span>
              <strong>{selected.masked_address}</strong>
            </div>
            <div>
              <span className="muted small">Meter</span>
              <strong>{selected.meter_type === "smart" ? "Smart" : "Traditional"}</strong>
            </div>
          </div>
          <button type="button" className="ghost wide" onClick={onLink}>+ Link another Household</button>
        </section>
      </aside>

      <div className="dash-wide">
        <section className="card account-info-card" aria-labelledby="account-holder-heading">
          <div className="account-card-head">
            <div>
              <h2 id="account-holder-heading">Account holder</h2>
              <span className="muted small">Personal information & player identity for your Meralco account</span>
            </div>
            {!editing ? (
              <button type="button" className="ghost" onClick={startEdit}>Edit info</button>
            ) : (
              <div className="row">
                <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button type="button" className="primary" onClick={saveEdit}>Save</button>
              </div>
            )}
          </div>

          {savedNote && !editing && (
            <p className="account-saved-pill" role="status">✓ Holder profile updated!</p>
          )}

          {editing ? (
            <div className="account-edit-grid">
              <label>
                <span>Account holder full name</span>
                <input
                  type="text"
                  value={draft.fullName}
                  onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                />
              </label>
              <label>
                <span>Nickname / player handle</span>
                <input
                  type="text"
                  value={draft.nickname}
                  onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
                />
              </label>
              <label>
                <span>Player title badge</span>
                <select value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}>
                  {TITLES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Household role</span>
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </label>
              <label>
                <span>Mobile number</span>
                <input
                  type="tel"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </label>
            </div>
          ) : (
            <ul className="account-info-grid" role="list">
              <li className="account-info-tile">
                <span className="account-tile-label">👤 Holder Name</span>
                <strong>{profile.fullName}</strong>
                <span className="muted small">{profile.role}</span>
              </li>
              <li className="account-info-tile">
                <span className="account-tile-label">🏷️ Player Tag & Title</span>
                <strong>@{profile.nickname}</strong>
                <span className="account-badge-inline">{profile.title}</span>
              </li>
              <li className="account-info-tile">
                <span className="account-tile-label">✉️ Email Address</span>
                <strong>{profile.email}</strong>
                <span className="muted small">Verified login</span>
              </li>
              <li className="account-info-tile">
                <span className="account-tile-label">📱 Mobile Number</span>
                <strong>{profile.phone}</strong>
                <span className="muted small">SMS & OTP alerts</span>
              </li>
              <li className="account-info-tile">
                <span className="account-tile-label">🏡 Home Profile</span>
                <strong>{householdSize ? `${householdSize} Household Members` : "Standard Household"}</strong>
                <span className="muted small">{selected.masked_address}</span>
              </li>
              <li className="account-info-tile">
                <span className="account-tile-label">📬 Billing Preference</span>
                <strong>{profile.billingPref}</strong>
                <span className="muted small">SIN {maskSin(selected.sin)}</span>
              </li>
            </ul>
          )}
        </section>

        <section className="card account-badges-card" aria-labelledby="account-badges-heading">
          <div className="account-card-head">
            <div>
              <h3 id="account-badges-heading">Holder badges & milestones</h3>
              <span className="muted small">Unlocked by linking your bill and setting up your home with Eelio</span>
            </div>
            <span className="goal-reward">Lv. {level} Holder</span>
          </div>
          <ul className="account-badges-grid" role="list">
            {badges.map((b) => (
              <li key={b.id} className={`account-badge-tile${b.unlocked ? " unlocked" : " locked"}`}>
                <span className="account-badge-icon" aria-hidden="true">{b.icon}</span>
                <div>
                  <strong>{b.title}</strong>
                  <p className="muted small">{b.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
