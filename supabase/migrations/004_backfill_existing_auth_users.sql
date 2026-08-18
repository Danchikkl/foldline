-- Foldline v0.2 backfill for users that existed before migrations/triggers were installed.
-- If an auth user already existed before 001_init.sql was applied, the on_auth_user_created trigger never fired.
-- This migration creates the missing profile, subscription, default workspace, and owner membership safely/idempotently.

insert into public.profiles (id, full_name)
select
  u.id,
  left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 100)
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

insert into public.subscriptions (user_id)
select u.id
from auth.users u
where not exists (
  select 1 from public.subscriptions s where s.user_id = u.id
);

insert into public.organizations (name, slug, created_by)
select
  coalesce(nullif(left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 100), ''), 'My workspace'),
  'workspace-' || replace(u.id::text, '-', ''),
  u.id
from auth.users u
where not exists (
  select 1
  from public.organizations o
  where o.slug = 'workspace-' || replace(u.id::text, '-', '')
);

insert into public.organization_members (organization_id, user_id, role)
select
  o.id,
  o.created_by,
  'owner'
from public.organizations o
where o.slug = 'workspace-' || replace(o.created_by::text, '-', '')
on conflict (organization_id, user_id) do nothing;

-- Attach any pre-existing documents to the user's default workspace.
update public.documents d
set organization_id = o.id
from public.organizations o
where d.organization_id is null
  and o.created_by = d.owner_id
  and o.slug = 'workspace-' || replace(d.owner_id::text, '-', '');
