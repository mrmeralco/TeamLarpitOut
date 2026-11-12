-- Smart meter Households earn Points per day; the Bill gives them none (ADR-0008).

-- A daily entry carries the Asia/Manila date its savings were measured on.
alter table public.points_entries add column day date;
alter table public.points_entries drop constraint points_entries_source_check;
alter table public.points_entries add constraint points_entries_source_check
  check (source in ('bill_verified', 'meter_verified', 'self_report', 'redemption', 'welcome'));
alter table public.points_entries add constraint points_entries_day_check
  check ((source = 'meter_verified') = (day is not null));
-- One entry per Household per day.
create unique index points_entries_one_per_day on public.points_entries (sin, day) where source = 'meter_verified';

-- When the Household first started Missions; daily Points count from the next day.
alter table public.usage_plans add column started_at timestamptz;
