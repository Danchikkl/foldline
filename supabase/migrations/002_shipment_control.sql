-- Foldline v0.2 — Shipment Control
-- Adds organization workspaces, shipment packets, normalized document fields and cross-document discrepancies.
-- This migration is additive so the v0.1 document workflow can continue running while the UI/API are migrated.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (char_length(slug) between 3 and 160),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists organization_members_user_idx on public.organization_members(user_id, organization_id);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  reference text not null check (char_length(reference) between 1 and 120),
  origin text check (origin is null or char_length(origin) <= 120),
  destination text check (destination is null or char_length(destination) <= 120),
  status text not null default 'draft' check (status in ('draft','processing','review','clear','attention','archived')),
  risk_score smallint not null default 0 check (risk_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipments_org_created_idx on public.shipments(organization_id, created_at desc);
create index if not exists shipments_org_status_idx on public.shipments(organization_id, status, created_at desc);

-- Keep owner_id for backwards compatibility and audit attribution. organization_id / shipment_id become the collaboration layer.
alter table public.documents add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.documents add column if not exists shipment_id uuid references public.shipments(id) on delete cascade;
alter table public.documents add column if not exists document_type text;
alter table public.documents add column if not exists classification_confidence numeric(4,3);

alter table public.documents drop constraint if exists documents_document_type_check;
alter table public.documents add constraint documents_document_type_check
  check (document_type is null or document_type in ('commercial_invoice','packing_list','purchase_order','cmr','bill_of_lading','air_waybill','certificate','other'));
alter table public.documents drop constraint if exists documents_classification_confidence_check;
alter table public.documents add constraint documents_classification_confidence_check
  check (classification_confidence is null or classification_confidence between 0 and 1);

create index if not exists documents_org_created_idx on public.documents(organization_id, created_at desc);
create index if not exists documents_shipment_idx on public.documents(shipment_id, created_at asc);
create index if not exists documents_shipment_type_idx on public.documents(shipment_id, document_type);

create table if not exists public.document_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  field_key text not null check (char_length(field_key) between 1 and 100),
  value_text text,
  value_number numeric,
  value_date date,
  unit text check (unit is null or char_length(unit) <= 32),
  currency text check (currency is null or char_length(currency) <= 8),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  normalized_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, field_key)
);
create index if not exists document_fields_document_idx on public.document_fields(document_id, field_key);
create index if not exists document_fields_key_idx on public.document_fields(field_key);

create table if not exists public.discrepancies (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  rule_key text not null check (char_length(rule_key) between 1 and 100),
  field_key text check (field_key is null or char_length(field_key) <= 100),
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  title text not null check (char_length(title) between 1 and 180),
  message text not null check (char_length(message) <= 2000),
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  document_a_id uuid references public.documents(id) on delete set null,
  document_b_id uuid references public.documents(id) on delete set null,
  value_a jsonb,
  value_b jsonb,
  evidence jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discrepancies_shipment_status_idx on public.discrepancies(shipment_id, status, severity);

create table if not exists public.validation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_key text not null check (char_length(rule_key) between 1 and 100),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, rule_key)
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  shipment_id uuid references public.shipments(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  event_type text not null check (event_type in ('shipment_created','document_uploaded','document_processed','shipment_checked','export_created')),
  units integer not null default 1 check (units > 0),
  created_at timestamptz not null default now()
);
create index if not exists usage_events_org_created_idx on public.usage_events(organization_id, created_at desc);

alter table public.audit_events add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.audit_events add column if not exists shipment_id uuid references public.shipments(id) on delete set null;

-- Give every existing account a private default workspace without touching its current documents yet.
insert into public.organizations (name, slug, created_by)
select
  coalesce(nullif(left(p.full_name, 100), ''), 'My workspace'),
  'workspace-' || replace(p.id::text, '-', ''),
  p.id
from public.profiles p
where not exists (
  select 1 from public.organizations o where o.slug = 'workspace-' || replace(p.id::text, '-', '')
);

insert into public.organization_members (organization_id, user_id, role)
select o.id, o.created_by, 'owner'
from public.organizations o
where o.slug = 'workspace-' || replace(o.created_by::text, '-', '')
on conflict (organization_id, user_id) do nothing;

-- Backfill old v0.1 documents into the account's default workspace. shipment_id stays null until a packet is created.
update public.documents d
set organization_id = o.id
from public.organizations o
where d.organization_id is null
  and o.created_by = d.owner_id
  and o.slug = 'workspace-' || replace(d.owner_id::text, '-', '');

-- New accounts receive a default organization automatically.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  new_org_id uuid;
  workspace_name text;
begin
  insert into public.profiles(id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name',''),100));

  insert into public.subscriptions(user_id) values (new.id) on conflict do nothing;

  workspace_name := coalesce(nullif(left(new.raw_user_meta_data ->> 'full_name', 100), ''), 'My workspace');
  insert into public.organizations(name, slug, created_by)
  values (workspace_name, 'workspace-' || replace(new.id::text, '-', ''), new.id)
  returning id into new_org_id;

  insert into public.organization_members(organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end; $$;

-- RLS: users can read only organizations they belong to. Mutations remain server-side/service-role only.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.shipments enable row level security;
alter table public.document_fields enable row level security;
alter table public.discrepancies enable row level security;
alter table public.validation_rules enable row level security;
alter table public.usage_events enable row level security;

revoke all on table public.organizations, public.organization_members, public.shipments, public.document_fields, public.discrepancies, public.validation_rules, public.usage_events from anon, authenticated;
grant select on table public.organizations, public.organization_members, public.shipments, public.document_fields, public.discrepancies, public.validation_rules, public.usage_events to authenticated;

create policy "organizations_select_member" on public.organizations for select to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.organization_id = id and m.user_id = (select auth.uid())
));

create policy "organization_members_select_member" on public.organization_members for select to authenticated
using (exists (
  select 1 from public.organization_members self
  where self.organization_id = organization_id and self.user_id = (select auth.uid())
));

create policy "shipments_select_member" on public.shipments for select to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.organization_id = organization_id and m.user_id = (select auth.uid())
));

create policy "document_fields_select_member" on public.document_fields for select to authenticated
using (exists (
  select 1
  from public.documents d
  join public.organization_members m on m.organization_id = d.organization_id
  where d.id = document_id and m.user_id = (select auth.uid())
));

create policy "discrepancies_select_member" on public.discrepancies for select to authenticated
using (exists (
  select 1
  from public.shipments s
  join public.organization_members m on m.organization_id = s.organization_id
  where s.id = shipment_id and m.user_id = (select auth.uid())
));

create policy "validation_rules_select_member" on public.validation_rules for select to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.organization_id = organization_id and m.user_id = (select auth.uid())
));

create policy "usage_events_select_member" on public.usage_events for select to authenticated
using (exists (
  select 1 from public.organization_members m
  where m.organization_id = organization_id and m.user_id = (select auth.uid())
));

-- Existing documents/jobs/audit rows gain organization-aware read policies while retaining the v0.1 owner policies.
create policy "documents_select_org_member" on public.documents for select to authenticated
using (organization_id is not null and exists (
  select 1 from public.organization_members m
  where m.organization_id = organization_id and m.user_id = (select auth.uid())
));

create policy "jobs_select_org_member" on public.processing_jobs for select to authenticated
using (exists (
  select 1
  from public.documents d
  join public.organization_members m on m.organization_id = d.organization_id
  where d.id = document_id and m.user_id = (select auth.uid())
));

create policy "audit_select_org_member" on public.audit_events for select to authenticated
using (organization_id is not null and exists (
  select 1 from public.organization_members m
  where m.organization_id = organization_id and m.user_id = (select auth.uid())
));
