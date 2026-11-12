-- Keep a Mission Plan's missions in the order they were chosen (the API stores them as a list).
alter table public.usage_plan_missions add column position smallint not null default 0;
