-- Zero-knowledge vault. The server stores only ciphertext: invoices are read,
-- checked and encrypted in the user's browser with a key derived from the
-- workspace passphrase, which never reaches the server.

create table if not exists public.organization_vaults (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  -- KDF parameters, salt and the WRAPPED data key. Useless without the passphrase.
  header jsonb not null check (octet_length(header::text) < 4096)
);

create table if not exists public.vault_records (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  iv text not null check (char_length(iv) between 12 and 32),
  ciphertext text not null check (char_length(ciphertext) between 16 and 400000)
);

create index if not exists vault_records_org_created_idx
  on public.vault_records (organization_id, created_at);

alter table public.organization_vaults enable row level security;
alter table public.vault_records enable row level security;

-- Browsers may only read their own workspace's ciphertext; all writes go
-- through validated server routes using the service role.
revoke all on table public.organization_vaults, public.vault_records from anon, authenticated;
grant select on table public.organization_vaults, public.vault_records to authenticated;

drop policy if exists "organization_vaults_select_member" on public.organization_vaults;
create policy "organization_vaults_select_member" on public.organization_vaults
  for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists "vault_records_select_member" on public.vault_records;
create policy "vault_records_select_member" on public.vault_records
  for select to authenticated using (public.is_org_member(organization_id));
