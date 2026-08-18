-- Foldline MVP schema. Run with Supabase migrations; do not paste service-role keys into client code.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  plan text not null default 'free' check (plan in ('free','pro')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  original_filename text not null check (char_length(original_filename) <= 180),
  storage_key text not null unique,
  content_type text not null check (content_type in ('application/pdf','image/png','image/jpeg','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  status text not null default 'uploading' check (status in ('uploading','queued','processing','ready','reviewed','failed')),
  raw_ocr_text text,
  extracted_data jsonb,
  validation_data jsonb,
  error_message text,
  processed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_owner_created_idx on public.documents(owner_id, created_at desc);
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  status text not null check (status in ('queued','processing','completed','failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists processing_jobs_document_idx on public.processing_jobs(document_id, created_at desc);
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.stripe_events (
  id text primary key,
  event_type text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.documents enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.audit_events enable row level security;
alter table public.stripe_events enable row level security;

-- Least privilege at the Postgres grant layer, in addition to RLS.
revoke all on table public.profiles, public.subscriptions, public.documents, public.processing_jobs, public.audit_events, public.stripe_events from anon, authenticated;
grant select on table public.profiles, public.subscriptions, public.documents, public.processing_jobs, public.audit_events to authenticated;
grant update(full_name) on table public.profiles to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "subscriptions_select_own" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "documents_select_own" on public.documents for select to authenticated using ((select auth.uid()) = owner_id);
create policy "jobs_select_own" on public.processing_jobs for select to authenticated using (exists(select 1 from public.documents d where d.id=document_id and d.owner_id=(select auth.uid())));
create policy "audit_select_own" on public.audit_events for select to authenticated using ((select auth.uid()) = user_id);
-- No authenticated write policy for documents/subscriptions/jobs/audit/stripe_events: all mutations go through authenticated server routes using the service role after explicit ownership checks.

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name) values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name',''),100));
  insert into public.subscriptions(user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
