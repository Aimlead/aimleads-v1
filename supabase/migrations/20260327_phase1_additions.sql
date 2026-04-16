-- Phase 1: Non-breaking additions — safe to run on existing data
-- Adds billing fields, missing index, app_user_id bridge, public funnel tables.

-- 1a. Workspace billing fields
alter table workspaces
  add column if not exists plan_slug      text not null default 'free',
  add column if not exists selected_plan_at timestamptz,
  add column if not exists billing_status text not null default 'active',
  add column if not exists trial_ends_at  timestamptz,
  add column if not exists settings       jsonb not null default '{}'::jsonb;

-- 1b. Missing index: workspace member listing by workspace
create index if not exists idx_workspace_members_workspace
  on workspace_members(workspace_id);

-- 1c. app_user_id bridge column on workspace_members
--     Stores the stable internal users.id alongside the auth-uid user_id.
alter table workspace_members
  add column if not exists app_user_id text references users(id) on delete set null;

-- 1d. Backfill app_user_id from users table
update workspace_members wm
set app_user_id = u.id
from users u
where u.supabase_auth_id = wm.user_id
  and wm.app_user_id is null;

-- Also try matching by users.id in case backfill hasn't run yet
update workspace_members wm
set app_user_id = u.id
from users u
where u.id = wm.user_id
  and wm.app_user_id is null;

-- 1e. demo_requests table (public funnel)
create table if not exists demo_requests (
  id         text        primary key default gen_random_uuid()::text,
  email      text        not null,
  company    text,
  message    text,
  plan_slug  text,
  source     text,
  created_at timestamptz not null default now()
);

create index if not exists idx_demo_requests_created on demo_requests(created_at desc);

-- 1f. analytics_events table (public funnel)
create table if not exists analytics_events (
  id         text        primary key default gen_random_uuid()::text,
  session_id text,
  event_name text        not null,
  properties jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_name on analytics_events(event_name, created_at desc);
