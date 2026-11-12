-- Demo Households get spendable Points from db:seed (source 'demo_bonus', server/src/domain/demo-points.ts)
-- so the Rewards shop can be tried in a demo. Only the seed writes this source.
alter table public.points_entries drop constraint if exists points_entries_source_check;
alter table public.points_entries add constraint points_entries_source_check
  check (source in ('bill_verified', 'meter_verified', 'self_report', 'redemption', 'welcome', 'demo_bonus'));
