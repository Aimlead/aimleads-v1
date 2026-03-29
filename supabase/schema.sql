-- AimLeads SaaS — Schema V1 (clean)
-- Run in Supabase SQL editor (staging then production).
-- Identity model: workspace_members.user_id = auth.uid() (supabase_auth_id).
-- RLS uses workspace_members only — single canonical path.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

create table if not exists workspaces (
  id            text        primary key,
  name          text        not null,
  plan_slug     text        not null default 'free',
  selected_plan_at timestamptz,
  billing_status text       not null default 'active',
  trial_ends_at timestamptz,
  settings      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- users: no workspace_id (membership via workspace_members only)
--        no password_hash (Supabase Auth is the source of truth)
create table if not exists users (
  id               text        primary key,
  supabase_auth_id text        unique not null,
  email            text        not null unique,
  full_name        text        not null,
  created_at       timestamptz not null default now()
);

-- workspace_members: user_id always = users.supabase_auth_id = auth.uid()
create table if not exists workspace_members (
  workspace_id text        not null references workspaces(id) on delete cascade,
  user_id      text        not null,                          -- = supabase_auth_id
  app_user_id  text        references users(id) on delete set null, -- stable internal ref
  role         text        not null default 'member',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

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

create table if not exists icp_profiles (
  id           text        primary key,
  workspace_id text        not null references workspaces(id) on delete cascade,
  name         text        not null,
  description  text,
  is_active    boolean     not null default false,
  weights      jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- leads: 28 columns (down from 44)
-- Intermediate scoring fields folded into score_details jsonb.
-- Duplicates (generated_icebreaker, ai_summary, signals, icp_profile_name, etc.) removed.
create table if not exists leads (
  id                      text        primary key,
  workspace_id            text        not null references workspaces(id) on delete cascade,
  icp_profile_id          text        references icp_profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  -- input
  company_name            text        not null,
  website_url             text,
  industry                text,
  company_size            integer,
  country                 text,
  contact_name            text,
  contact_role            text,
  contact_email           text,
  source_list             text,
  -- pipeline state
  status                  text,
  follow_up_status        text,
  notes                   text,
  -- scoring output (flat — for indexes + UI display)
  final_score             integer,
  final_category          text,
  final_priority          integer,
  final_recommended_action text,
  ai_confidence           integer,
  analysis_version        text,
  last_analyzed_at        timestamptz,
  -- analysis blobs (structured JSON)
  score_details           jsonb,   -- all intermediate scores + weights snapshot
  intent_signals          jsonb,   -- manual signals
  internet_signals        jsonb,   -- web discovery results
  auto_signal_metadata    jsonb,   -- discovery run metadata
  generated_icebreakers   jsonb,
  analysis_summary        text
);

-- audit_log: immutable (no deletes allowed)
create table if not exists audit_log (
  id            text        primary key,
  workspace_id  text        not null references workspaces(id) on delete cascade,
  user_id       text        not null,
  action        text        not null,
  resource_type text        not null,
  resource_id   text        not null,
  changes       jsonb,
  created_at    timestamptz not null default now()
);

-- demo_requests: public funnel capture (no auth required)
create table if not exists demo_requests (
  id         text        primary key default gen_random_uuid()::text,
  email      text        not null,
  company    text,
  message    text,
  plan_slug  text,
  source     text,
  created_at timestamptz not null default now()
);

-- analytics_events: public funnel tracking (no auth required)
create table if not exists analytics_events (
  id         text        primary key default gen_random_uuid()::text,
  session_id text,
  event_name text        not null,
  properties jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────

create index if not exists idx_users_supabase_auth_id       on users(supabase_auth_id);
create index if not exists idx_workspace_members_workspace  on workspace_members(workspace_id);
create index if not exists idx_workspace_members_user       on workspace_members(user_id);
create index if not exists idx_workspace_invites_workspace  on workspace_invites(workspace_id, created_at desc);
create unique index if not exists idx_workspace_invites_active_email
  on workspace_invites(lower(email))
  where accepted_at is null and revoked_at is null;
create index if not exists idx_icp_workspace_active         on icp_profiles(workspace_id, is_active);
create index if not exists idx_icp_active                   on icp_profiles(workspace_id) where is_active = true;
create index if not exists idx_leads_workspace_created      on leads(workspace_id, created_at desc);
create index if not exists idx_leads_workspace_status       on leads(workspace_id, status);
create index if not exists idx_leads_final_score            on leads(workspace_id, final_score desc);
create index if not exists idx_leads_icp_profile            on leads(workspace_id, icp_profile_id);
create index if not exists idx_leads_contact_email          on leads(workspace_id, contact_email);
create index if not exists idx_leads_updated_at             on leads(workspace_id, updated_at desc);
create index if not exists idx_leads_deleted_at             on leads(workspace_id, deleted_at) where deleted_at is null;
create index if not exists idx_audit_log_workspace          on audit_log(workspace_id, created_at desc);
create index if not exists idx_audit_log_resource           on audit_log(resource_type, resource_id);
create index if not exists idx_demo_requests_created        on demo_requests(created_at desc);
create index if not exists idx_analytics_events_name        on analytics_events(event_name, created_at desc);

-- ─────────────────────────────────────────────
-- TRIGGERS
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
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
-- Single canonical identity: workspace_members.user_id = auth.uid().
-- All policies use workspace_members — no dual-path OR branches.
-- ─────────────────────────────────────────────

alter table workspaces        enable row level security;
alter table users             enable row level security;
alter table workspace_members enable row level security;
alter table workspace_invites enable row level security;
alter table icp_profiles      enable row level security;
alter table leads             enable row level security;
alter table audit_log         enable row level security;

-- workspaces: any member of the workspace can read it
drop policy if exists workspaces_select on workspaces;
create policy workspaces_select on workspaces
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists workspaces_update on workspaces;
create policy workspaces_update on workspaces
for update using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
) with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- users: a user can read themselves + teammates (same workspaces)
drop policy if exists users_select on users;
create policy users_select on users
for select using (
  users.supabase_auth_id = auth.uid()::text
  or exists (
    select 1 from workspace_members wm_self
    join workspace_members wm_other
      on wm_other.workspace_id = wm_self.workspace_id
    where wm_self.user_id = auth.uid()::text
      and wm_other.app_user_id = users.id
  )
);

drop policy if exists users_update on users;
create policy users_update on users
for update using (
  users.supabase_auth_id = auth.uid()::text
) with check (
  users.supabase_auth_id = auth.uid()::text
);

-- workspace_members: any member can read the team list
drop policy if exists workspace_members_select on workspace_members;
create policy workspace_members_select on workspace_members
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

-- only owners can insert/update/delete members (incl. role changes)
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

-- workspace_invites: owners/admins can read and manage
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

-- icp_profiles: all members read; owner/admin write
drop policy if exists icp_select on icp_profiles;
create policy icp_select on icp_profiles
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists icp_insert on icp_profiles;
create policy icp_insert on icp_profiles
for insert with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists icp_update on icp_profiles;
create policy icp_update on icp_profiles
for update using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
) with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists icp_delete on icp_profiles;
create policy icp_delete on icp_profiles
for delete using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = icp_profiles.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- leads: all members read; all members write (leads are shared workspace data)
drop policy if exists leads_select on leads;
create policy leads_select on leads
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists leads_insert on leads;
create policy leads_insert on leads
for insert with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists leads_update on leads;
create policy leads_update on leads
for update using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
) with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists leads_delete on leads;
create policy leads_delete on leads
for delete using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

-- audit_log: all members read; all members insert; nobody deletes
drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = audit_log.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log
for insert with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = audit_log.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists audit_log_no_delete on audit_log;
create policy audit_log_no_delete on audit_log
for delete using (false);

-- demo_requests and analytics_events are public (no RLS needed)
-- Access controlled at the Express layer via public routes only.
