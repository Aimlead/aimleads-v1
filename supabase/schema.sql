-- AimLeads SaaS schema (Supabase/Postgres)
-- Run in Supabase SQL editor for staging, then production.

create extension if not exists pgcrypto;

create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  supabase_auth_id text unique,
  password_hash text,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists workspace_invites (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  invited_by_user_id text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by_user_id text,
  revoked_at timestamptz
);

alter table workspace_invites add column if not exists invited_by_user_id text;

create table if not exists icp_profiles (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  owner_user_id text not null,
  name text not null,
  description text,
  is_active boolean not null default false,
  weights jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now()
);

create table if not exists leads (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  owner_user_id text not null,
  created_date timestamptz not null default now(),
  company_name text not null,
  website_url text,
  industry text,
  company_size integer,
  country text,
  contact_name text,
  contact_role text,
  contact_email text,
  source_list text,
  status text,
  follow_up_status text,
  notes text,
  analysis_summary text,
  generated_icebreaker text,
  generated_icebreakers jsonb,
  intent_signals jsonb,
  signals jsonb,
  score_details jsonb,
  internet_signals jsonb,
  auto_signal_metadata jsonb,
  ai_signals jsonb,
  ai_summary text,
  scoring_weights jsonb,
  icp_profile_id text,
  icp_profile_name text,
  analysis_version text,
  last_analyzed_at timestamptz,
  icp_raw_score integer,
  icp_score integer,
  icp_category text,
  icp_priority integer,
  recommended_action text,
  ai_score integer,
  ai_confidence integer,
  final_score integer,
  final_category text,
  final_priority integer,
  final_recommended_action text,
  final_status text
);

create index if not exists idx_users_workspace on users(workspace_id);
create index if not exists idx_users_supabase_auth_id on users(supabase_auth_id);
create index if not exists idx_workspace_members_user on workspace_members(user_id);
create index if not exists idx_workspace_invites_workspace on workspace_invites(workspace_id, created_at desc);
create unique index if not exists idx_workspace_invites_active_email on workspace_invites(lower(email))
  where accepted_at is null and revoked_at is null;
create index if not exists idx_icp_workspace_active on icp_profiles(workspace_id, is_active);
create index if not exists idx_leads_workspace_created on leads(workspace_id, created_date desc);
create index if not exists idx_leads_workspace_status on leads(workspace_id, status);

-- Performance indexes (migration v2)
create index if not exists idx_leads_final_score on leads(workspace_id, final_score desc);
create index if not exists idx_leads_icp_profile_id on leads(workspace_id, icp_profile_id);

-- Missing indexes (migration v3)
create index if not exists idx_leads_contact_email on leads(workspace_id, contact_email);
create index if not exists idx_icp_owner_user on icp_profiles(workspace_id, owner_user_id);

-- Partial index for active ICP lookups (migration v3)
create index if not exists idx_icp_active on icp_profiles(workspace_id) where is_active = true;

-- FK from leads.icp_profile_id → icp_profiles (migration v3, safe ADD)
do $$ begin
  alter table leads add constraint fk_leads_icp_profile
    foreign key (icp_profile_id) references icp_profiles(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- Soft delete support (migration v3)
-- Adds deleted_at column to leads; application filters out non-null rows by default.
alter table leads add column if not exists deleted_at timestamptz default null;
create index if not exists idx_leads_deleted_at on leads(workspace_id, deleted_at) where deleted_at is null;

-- updated_at column + auto-update trigger (migration v2)
alter table leads add column if not exists updated_at timestamptz default now();
create index if not exists idx_leads_updated_at on leads(workspace_id, updated_at desc);

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

alter table workspaces enable row level security;
alter table users enable row level security;
alter table workspace_members enable row level security;
alter table workspace_invites enable row level security;
alter table icp_profiles enable row level security;
alter table leads enable row level security;

-- Access model for Supabase Auth native:
-- auth.uid() maps to users.supabase_auth_id.

-- Workspaces

drop policy if exists workspaces_select on workspaces;
create policy workspaces_select on workspaces
for select using (
  exists (
    select 1
    from users u
    where u.workspace_id = workspaces.id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()::text
  )
);

-- Users

drop policy if exists users_select on users;
create policy users_select on users
for select using (
  users.supabase_auth_id = auth.uid()::text
  or exists (
    select 1
    from users u
    where u.workspace_id = users.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = users.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

-- Workspace members

drop policy if exists workspace_members_select on workspace_members;
create policy workspace_members_select on workspace_members
for select using (
  workspace_members.user_id = auth.uid()::text
  or exists (
    select 1
    from users u
    where u.workspace_id = workspace_members.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists workspace_invites_select on workspace_invites;
create policy workspace_invites_select on workspace_invites
for select using (
  exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists workspace_invites_manage on workspace_invites;
create policy workspace_invites_manage on workspace_invites
for all using (
  exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
) with check (
  exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- Leads

drop policy if exists leads_select on leads;
create policy leads_select on leads
for select using (
  exists (
    select 1
    from users u
    where u.workspace_id = leads.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists leads_insert on leads;
create policy leads_insert on leads
for insert with check (
  exists (
    select 1
    from users u
    where u.workspace_id = leads.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists leads_update on leads;
create policy leads_update on leads
for update using (
  exists (
    select 1
    from users u
    where u.workspace_id = leads.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
) with check (
  exists (
    select 1
    from users u
    where u.workspace_id = leads.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists leads_delete on leads;
create policy leads_delete on leads
for delete using (
  exists (
    select 1
    from users u
    where u.workspace_id = leads.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

-- ICP profiles

drop policy if exists icp_select on icp_profiles;
create policy icp_select on icp_profiles
for select using (
  exists (
    select 1
    from users u
    where u.workspace_id = icp_profiles.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists icp_insert on icp_profiles;
create policy icp_insert on icp_profiles
for insert with check (
  exists (
    select 1
    from users u
    where u.workspace_id = icp_profiles.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists icp_update on icp_profiles;
create policy icp_update on icp_profiles
for update using (
  exists (
    select 1
    from users u
    where u.workspace_id = icp_profiles.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
  )
) with check (
  exists (
    select 1
    from users u
    where u.workspace_id = icp_profiles.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists icp_delete on icp_profiles;
create policy icp_delete on icp_profiles
for delete using (
  exists (
    select 1
    from users u
    where u.workspace_id = icp_profiles.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

-- Audit log: immutable (no deletes allowed) — migration v2
create table if not exists audit_log (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  changes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_workspace on audit_log(workspace_id, created_at desc);
create index if not exists idx_audit_log_resource on audit_log(resource_type, resource_id);

alter table audit_log enable row level security;

drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log
for select using (
  exists (
    select 1 from users u
    where u.workspace_id = audit_log.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1 from workspace_members wm
    where wm.workspace_id = audit_log.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log
for insert with check (
  exists (
    select 1 from users u
    where u.workspace_id = audit_log.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1 from workspace_members wm
    where wm.workspace_id = audit_log.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

-- Deny all deletes on audit_log to enforce immutability
drop policy if exists audit_log_no_delete on audit_log;
create policy audit_log_no_delete on audit_log
for delete using (false);

-- workspace_members: owner-only modify policy (migration v2)
drop policy if exists workspace_members_modify on workspace_members;
create policy workspace_members_modify on workspace_members
for all using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role = 'owner'
  )
);
