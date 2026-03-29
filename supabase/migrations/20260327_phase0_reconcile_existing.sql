-- Phase 0: Reconcile existing Supabase DB to match V1 schema
-- Safe for an existing DB (all statements are idempotent).
-- This runs BEFORE phases 1-5 and handles column renames + missing tables.

-- ─────────────────────────────────────────────
-- workspace_invites (table is missing entirely)
-- ─────────────────────────────────────────────
create table if not exists workspace_invites (
  id                  text        primary key,
  workspace_id        text        not null references workspaces(id) on delete cascade,
  email               text        not null,
  role                text        not null default 'member',
  invited_by_user_id  text,
  created_at          timestamptz not null default now(),
  accepted_at         timestamptz,
  accepted_by_user_id text,
  revoked_at          timestamptz
);

create index if not exists idx_workspace_invites_workspace
  on workspace_invites(workspace_id, created_at desc);
create unique index if not exists idx_workspace_invites_active_email
  on workspace_invites(lower(email))
  where accepted_at is null and revoked_at is null;

alter table workspace_invites enable row level security;

drop policy if exists workspace_invites_select on workspace_invites;
create policy workspace_invites_select on workspace_invites
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists workspace_invites_manage on workspace_invites;
create policy workspace_invites_manage on workspace_invites
for all using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
) with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- ─────────────────────────────────────────────
-- icp_profiles: rename created_date → created_at, add updated_at
-- ─────────────────────────────────────────────
do $$ begin
  alter table icp_profiles rename column created_date to created_at;
exception when undefined_column then null;
end $$;

alter table icp_profiles
  add column if not exists updated_at timestamptz not null default now();

-- ─────────────────────────────────────────────
-- leads: rename created_date → created_at
-- ─────────────────────────────────────────────
do $$ begin
  alter table leads rename column created_date to created_at;
exception when undefined_column then null;
end $$;

-- leads: add intent_signals (was missing, different from signals)
alter table leads
  add column if not exists intent_signals jsonb;

-- leads: add final_status if missing (old schema ref — will be dropped in phase 3)
alter table leads
  add column if not exists final_status text;

-- leads: add owner_user_id if missing (old schema ref — will be dropped in phase 3)
alter table leads
  add column if not exists owner_user_id text;

-- ─────────────────────────────────────────────
-- update_updated_at trigger function
-- ─────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_updated_at on leads;
create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

drop trigger if exists icp_profiles_updated_at on icp_profiles;
create trigger icp_profiles_updated_at
  before update on icp_profiles
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────
-- Indexes on renamed columns
-- ─────────────────────────────────────────────
create index if not exists idx_leads_workspace_created
  on leads(workspace_id, created_at desc);
create index if not exists idx_leads_workspace_status
  on leads(workspace_id, status);
create index if not exists idx_leads_final_score
  on leads(workspace_id, final_score desc);
create index if not exists idx_leads_icp_profile
  on leads(workspace_id, icp_profile_id);
create index if not exists idx_leads_contact_email
  on leads(workspace_id, contact_email);
create index if not exists idx_leads_updated_at
  on leads(workspace_id, updated_at desc);
create index if not exists idx_leads_deleted_at
  on leads(workspace_id, deleted_at) where deleted_at is null;
create index if not exists idx_icp_workspace_active
  on icp_profiles(workspace_id, is_active);
create index if not exists idx_icp_active
  on icp_profiles(workspace_id) where is_active = true;
create index if not exists idx_icp_owner_user
  on icp_profiles(workspace_id, owner_user_id);

-- FK from leads.icp_profile_id → icp_profiles
do $$ begin
  alter table leads add constraint fk_leads_icp_profile
    foreign key (icp_profile_id) references icp_profiles(id) on delete set null;
exception when duplicate_object then null;
end $$;
