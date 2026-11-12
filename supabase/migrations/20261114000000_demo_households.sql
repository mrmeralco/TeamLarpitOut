-- Demo Households (demo/test mode, AUTH_FIXED_CODE set): a scanned Bill whose CAN is not in the mock
-- Meralco data gets its own Household, SIN "8" + the CAN's last 9 digits (demoSinFor). Without these,
-- the database source could not store them and every such Bill linked to the shared sample Household,
-- so unrelated logins shared one appliance list, Setup and Mission Plan.

alter table meralco.accounts add column if not exists demo boolean not null default false;

-- A hand-added demo row predates the flag.
update meralco.accounts set demo = true where holder_name = 'Sample Household (demo)';

-- The demo Household's Bill History as the API builds it (the scanned Bill plus the sample's
-- earlier months), kept as the API's Bill objects rather than as printed Bills.
create table if not exists meralco.demo_histories (
  sin        text primary key references meralco.accounts (sin) on delete cascade on update cascade,
  bills      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table meralco.demo_histories enable row level security;
