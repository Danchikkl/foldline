create table if not exists public.preorders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  status text not null default 'reserved' check (status in ('reserved', 'contacted', 'converted', 'cancelled'))
);

create index if not exists preorders_created_at_idx
  on public.preorders (created_at desc);

alter table public.preorders enable row level security;

-- No direct browser access. Signed-in users join through a validated server route,
-- and the founder admin reads through the service-role client only after admin auth.
revoke all on table public.preorders from anon, authenticated;
