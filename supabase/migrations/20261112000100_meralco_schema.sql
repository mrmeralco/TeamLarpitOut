-- The mock Meralco system (schema `meralco`): accounts by CAN, Bills as printed, payments.
-- In production this data would come from Meralco; the API reads it only through BillSource and
-- MeralcoAccountSource (server/src/database/pg-meralco.source.ts). Amounts are integer centavos.
-- Never stored: the account holder's street address, invoice or reference numbers.

create schema if not exists meralco;

create table meralco.accounts (
  can               text primary key check (can ~ '^\d{10}$'),
  sin               text not null unique check (sin ~ '^\d{10,12}$'),
  holder_name       text not null,
  area              text not null,                          -- city or area only
  meter_type        text not null check (meter_type in ('traditional', 'smart')),
  meter_number      text,
  lifeline_eligible boolean not null default false
);

create table meralco.bills (
  id                         uuid primary key default gen_random_uuid(),
  sin                        text not null references meralco.accounts (sin) on delete cascade on update cascade,
  period                     char(7) not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- month of the bill date
  period_start               date not null,
  period_end                 date not null,
  billing_days               smallint not null check (billing_days > 0),
  bill_date                  date,
  due_date                   date,
  meter_number               text,
  previous_reading           integer,
  present_reading            integer,
  multiplier                 smallint not null default 1,
  kwh                        numeric(10, 2) not null check (kwh >= 0),
  estimated                  boolean not null default false,
  total_centavos             bigint not null,
  previous_balance_centavos  bigint not null default 0,
  payments_credited_centavos bigint,                         -- null when the record does not say
  provenance                 text not null check (provenance in ('real', 'reconstructed', 'generated', 'sample')),
  provenance_note            text,
  unique (sin, period),
  check (period_end >= period_start),
  check (present_reading is null or previous_reading is null or (present_reading - previous_reading) * multiplier = kwh)
);

-- Page 1 "Bill Computation Summary": the printed subtotal of each group.
create table meralco.bill_charge_groups (
  bill_id         uuid not null references meralco.bills (id) on delete cascade,
  group_code      text not null,     -- generation | transmission | system_loss | distribution | senior_citizen
                                     -- | taxes | universal | fit_all | gea_all | lifeline | other
  label           text not null,
  amount_centavos bigint not null,
  sort_order      smallint not null,
  primary key (bill_id, group_code)
);

-- Page 2 "How your bill was computed": every rate component.
create table meralco.bill_charge_lines (
  bill_id         uuid not null,
  line_no         smallint not null,
  group_code      text not null,
  code            text not null,     -- stable across months: generation_charge, awat_collect_1, vat_generation, ...
  schedule_code   text not null,     -- the Rate Schedule line it rolls up into (generation, vat_kwh, ...)
  label           text not null,
  base            numeric(12, 2),    -- 273 (kWh) | 1 (month) | 2648.97 (pesos, for percentage lines)
  base_unit       text check (base_unit in ('kwh', 'month', 'pesos')),
  price           numeric(12, 6),    -- 9.7032 | 16.38 | 9.21 (percent)
  price_unit      text check (price_unit in ('per_kwh', 'per_month', 'percent')),
  amount_centavos bigint not null,
  primary key (bill_id, line_no),
  unique (bill_id, code),
  foreign key (bill_id, group_code) references meralco.bill_charge_groups (bill_id, group_code) on delete cascade
);

-- "What you've paid".
create table meralco.payments (
  id              bigint generated always as identity primary key,
  sin             text not null references meralco.accounts (sin) on delete cascade on update cascade,
  for_period      char(7) not null check (for_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  posted_on       date not null,
  channel         text,
  amount_centavos bigint not null
);
create index payments_sin on meralco.payments (sin, posted_on);

alter table meralco.accounts           enable row level security;
alter table meralco.bills              enable row level security;
alter table meralco.bill_charge_groups enable row level security;
alter table meralco.bill_charge_lines  enable row level security;
alter table meralco.payments           enable row level security;
