create table if not exists public.pilot_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  company text check (company is null or char_length(company) <= 160),
  role text check (role is null or char_length(role) <= 160),
  message text not null check (char_length(message) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  source text not null default 'contact_page' check (char_length(source) <= 80)
);

create index if not exists pilot_requests_created_at_idx
  on public.pilot_requests (created_at desc);

create index if not exists pilot_requests_email_created_at_idx
  on public.pilot_requests (lower(email), created_at desc);

alter table public.pilot_requests enable row level security;

-- Deliberately no anon/authenticated RLS policies.
-- The public form writes through a validated server route using the service role,
-- and the admin page reads through the service role only after server-side admin auth.
revoke all on table public.pilot_requests from anon, authenticated;
