-- Any number of logins may link the same Household (ADR-0005, updated 2026-11-13): a second
-- login that scans the same Bill links it too, instead of being refused.
drop index if exists public.household_links_one_active_owner;
