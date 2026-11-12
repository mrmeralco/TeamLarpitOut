-- Eelio's own data (schema `public`). Every Household record is keyed by its Service ID Number
-- (`sin`, 10–12 digits); access is decided in the API through household_links (ADR-0005).
-- RLS is on with no policies: the browser's Supabase keys can read nothing; the API connects
-- with the database role, which bypasses RLS.
--
-- All of these tables are used by the API when DATABASE_URL is set (server/src/database/pg-*.ts).

create table public.accounts (
  owner_id       text primary key,                          -- "u_" + sha256(email), ownerIdForEmail()
  email          text not null unique check (email = lower(email)),
  phone          text not null,
  phone_verified boolean not null default false,
  password_hash  text,                                      -- scrypt; null until sign-up is finished
  created_at     timestamptz not null default now()
);

create table public.household_links (
  owner_id  text not null references public.accounts (owner_id) on delete cascade,
  sin       text not null check (sin ~ '^\d{10,12}$'),
  can       text not null check (can ~ '^\d{10}$'),
  status    text not null check (status in ('pending', 'active')),
  linked_at timestamptz not null default now(),
  primary key (owner_id, sin)
);
-- One login holds a Household at a time ("ownedByAnother").
create unique index household_links_one_active_owner on public.household_links (sin) where status = 'active';

create table public.household_changes (
  id          bigint generated always as identity primary key,
  sin         text not null check (sin ~ '^\d{10,12}$'),
  reason      text not null,
  period      char(7) check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  recorded_at timestamptz not null default now()
);
create index household_changes_sin on public.household_changes (sin, recorded_at);

-- Household Setup (ADR-0004, ADR-0006), one row per Household.
create table public.household_setup (
  sin             text primary key check (sin ~ '^\d{10,12}$'),
  size            smallint check (size > 0),
  home_pattern    text,
  aircon_pattern  text,
  grid            jsonb,                                    -- { "aircon": 1, "electric_fan": 2, ... }
  grid_written_at timestamptz,
  aircon_photo    jsonb,                                    -- { answers, kwhPerHour }
  completed_at    timestamptz
);

-- The appliance list; saving replaces a Household's rows in one transaction.
create table public.appliances (
  id            bigint generated always as identity primary key,
  sin           text not null check (sin ~ '^\d{10,12}$'),
  position      smallint not null,
  type          text not null,
  quantity      smallint not null default 1 check (quantity > 0),
  answers       jsonb,
  time_ranges   jsonb,                                      -- [{ start, end, days }]
  uses_per_week numeric,
  energy_label  jsonb,                                      -- confirmed DOE label only
  updated_at    timestamptz not null default now(),
  unique (sin, position)
);

-- Target and 5% Mission Plan per billing period (ADR-0007).
create table public.usage_plans (
  sin             text not null check (sin ~ '^\d{10,12}$'),
  period          char(7) not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  cut             smallint not null,
  target_kwh      numeric not null,
  target_centavos bigint not null,
  aircon_setting  smallint,
  source          text check (source in ('ai', 'fallback', 'manual')),
  wording         jsonb,
  shown           jsonb,                                    -- every set shown so far (shuffle)
  created_at      timestamptz not null default now(),
  primary key (sin, period)
);

create table public.usage_plan_missions (
  sin        text not null,
  period     char(7) not null,
  mission_id text not null,
  title      text not null,
  kwh_saved  numeric not null,
  peso_value bigint not null,                               -- centavos
  primary key (sin, period, mission_id),
  foreign key (sin, period) references public.usage_plans (sin, period) on delete cascade
);

-- Typed Mid-month Reading (traditional meters), one per Household per period.
create table public.mid_month_readings (
  sin            text not null check (sin ~ '^\d{10,12}$'),
  period         char(7) not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  reading        numeric not null,
  kwh_so_far     numeric not null,
  elapsed_days   smallint not null,
  remaining_days smallint not null,
  reading_date   date,
  created_at     timestamptz not null default now(),
  primary key (sin, period)
);

-- Points ledger: rows are only added; the balance is sum(points).
create table public.points_entries (
  id              text primary key,                         -- e.g. "welcome-<sin>"
  sin             text not null check (sin ~ '^\d{10,12}$'),
  period          char(7),
  points          integer not null,                         -- negative for redemptions
  source          text not null check (source in ('bill_verified', 'self_report', 'redemption', 'welcome')),
  saved_centavos  bigint not null default 0,
  saved_kwh       numeric not null default 0,
  baseline_kwh    numeric not null default 0,
  actual_kwh      numeric not null default 0,
  has_outage      boolean not null default false,
  excluded_reason text,
  description     text not null,
  reward_id       text,
  reward_name     text,
  created_at      timestamptz not null default now()
);
create index points_entries_sin on public.points_entries (sin, created_at);
-- Welcome Points are granted once per Household (ADR-0004).
create unique index points_entries_one_welcome on public.points_entries (sin) where source = 'welcome';

alter table public.accounts            enable row level security;
alter table public.household_links     enable row level security;
alter table public.household_changes   enable row level security;
alter table public.household_setup     enable row level security;
alter table public.appliances          enable row level security;
alter table public.usage_plans         enable row level security;
alter table public.usage_plan_missions enable row level security;
alter table public.mid_month_readings  enable row level security;
alter table public.points_entries      enable row level security;
