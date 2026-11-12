-- Data that lived in code or JSON, now in the database. Each table is keyed by what the data is about:
--   * a Household's own data (smart meter readings, outages) by `sin`, in the mock Meralco schema;
--   * Meralco-wide data (Rate Schedules) by billing month only, the same for every residential customer;
--   * data not about the house (weather by area, partner Rewards) has no `sin` at all.
-- `provenance` says whether a row is real or a sample made for the demo.

-- Smart meter interval readings: Wh used during the hour that starts at `hour_start`.
create table meralco.meter_readings (
  sin        text not null references meralco.accounts (sin) on delete cascade on update cascade,
  hour_start timestamptz not null,
  wh         integer not null check (wh >= 0),
  provenance text not null default 'sample' check (provenance in ('real', 'sample')),
  primary key (sin, hour_start)
);

-- Outages (brownouts) on Meralco's record for a Household. Points are not given for them.
create table meralco.outages (
  id             bigint generated always as identity primary key,
  sin            text not null references meralco.accounts (sin) on delete cascade on update cascade,
  period         char(7) not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  outage_date    date,                                    -- null when the record gives only the month
  duration_hours numeric check (duration_hours is null or duration_hours > 0),
  description    text,
  provenance     text not null default 'sample' check (provenance in ('real', 'sample')),
  check (outage_date is null or to_char(outage_date, 'YYYY-MM') = period)
);
create index outages_sin on meralco.outages (sin, period);

-- Meralco's Rate Schedule per billing month (ADR-0001), the same for every residential customer.
create table meralco.rate_schedules (
  period     char(7) primary key check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  per_kwh    jsonb not null,                              -- [{ code, label, rate, passThrough }]
  fixed      jsonb not null,                              -- [{ code, label, amount }]
  lifeline   jsonb,                                       -- { discountedCodes, tiers: [{ upToKwh, discount }] }
  note       text,
  provenance text not null default 'sample' check (provenance in ('real', 'sample'))
);

-- Daily temperature by area (the city on the Meralco account), never by Household.
create table public.weather_daily (
  area          text not null,
  date          date not null,
  temperature_c double precision not null,
  provenance    text not null default 'sample' check (provenance in ('observed', 'sample')),
  primary key (area, date)
);

-- Partner-funded Rewards, priced in Points. Never a deduction or discount on the Meralco bill.
create table public.rewards (
  id           text primary key,
  name         text not null,
  category     text not null check (category in ('load', 'e-wallet', 'voucher')),
  partner_name text not null,
  points_cost  integer not null check (points_cost > 0),
  description  text not null,
  is_sample    boolean not null default true,
  active       boolean not null default true,
  sort_order   smallint not null default 0
);

alter table meralco.meter_readings enable row level security;
alter table meralco.outages        enable row level security;
alter table meralco.rate_schedules enable row level security;
alter table public.weather_daily   enable row level security;
alter table public.rewards         enable row level security;
