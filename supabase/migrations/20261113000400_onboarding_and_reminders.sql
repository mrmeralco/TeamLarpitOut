-- Eelio's Missions onboarding is shown once per Household on any device, and "Remind me tonight"
-- on a Mission is kept on the server, so nothing a person does lives only in one browser.
alter table public.household_setup add column onboarding_seen_at timestamptz;

create table public.mission_reminders (
  sin        text not null check (sin ~ '^\d{10,12}$'),
  period     char(7) not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  mission_id text not null,
  created_at timestamptz not null default now(),
  primary key (sin, period, mission_id)
);

alter table public.mission_reminders enable row level security;
