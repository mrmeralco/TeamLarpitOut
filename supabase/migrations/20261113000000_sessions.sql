-- Signed-in sessions, so a sign-in survives API restarts and works across instances.
-- Only the SHA-256 of the bearer token is stored. Expiry slides with use (30 days idle),
-- capped at 90 days from sign-in; the API enforces both and prunes expired rows.

create table public.sessions (
  token_hash text primary key,                               -- hex sha256(bearer token)
  owner_id   text not null references public.accounts (owner_id) on delete cascade,
  created_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_owner_id_idx on public.sessions (owner_id);
create index sessions_expires_at_idx on public.sessions (expires_at);

alter table public.sessions enable row level security;
