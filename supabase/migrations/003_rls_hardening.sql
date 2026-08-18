-- Foldline v0.2 RLS hardening.
-- Avoid recursive organization_members policies by routing membership checks through a SECURITY DEFINER helper.

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

drop policy if exists "organizations_select_member" on public.organizations;
drop policy if exists "organization_members_select_member" on public.organization_members;
drop policy if exists "shipments_select_member" on public.shipments;
drop policy if exists "document_fields_select_member" on public.document_fields;
drop policy if exists "discrepancies_select_member" on public.discrepancies;
drop policy if exists "validation_rules_select_member" on public.validation_rules;
drop policy if exists "usage_events_select_member" on public.usage_events;
drop policy if exists "documents_select_org_member" on public.documents;
drop policy if exists "jobs_select_org_member" on public.processing_jobs;
drop policy if exists "audit_select_org_member" on public.audit_events;

create policy "organizations_select_member" on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy "organization_members_select_member" on public.organization_members for select to authenticated
using (public.is_org_member(organization_id));

create policy "shipments_select_member" on public.shipments for select to authenticated
using (public.is_org_member(organization_id));

create policy "document_fields_select_member" on public.document_fields for select to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = document_id
    and d.organization_id is not null
    and public.is_org_member(d.organization_id)
));

create policy "discrepancies_select_member" on public.discrepancies for select to authenticated
using (exists (
  select 1 from public.shipments s
  where s.id = shipment_id
    and public.is_org_member(s.organization_id)
));

create policy "validation_rules_select_member" on public.validation_rules for select to authenticated
using (public.is_org_member(organization_id));

create policy "usage_events_select_member" on public.usage_events for select to authenticated
using (public.is_org_member(organization_id));

create policy "documents_select_org_member" on public.documents for select to authenticated
using (organization_id is not null and public.is_org_member(organization_id));

create policy "jobs_select_org_member" on public.processing_jobs for select to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = document_id
    and d.organization_id is not null
    and public.is_org_member(d.organization_id)
));

create policy "audit_select_org_member" on public.audit_events for select to authenticated
using (organization_id is not null and public.is_org_member(organization_id));
