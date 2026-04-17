-- AimLeads SaaS — SaaS-grade features migration
-- Adds: api_keys, webhook_subscriptions, webhook_deliveries, outreach_templates
-- Updates: workspaces plan limits enforcement columns

-- ─────────────────────────────────────────────
-- 1. Workspace plan limits (billing enforcement)
-- ─────────────────────────────────────────────

alter table workspaces
  add column if not exists leads_limit        integer   not null default 100,
  add column if not exists seats_limit        integer   not null default 3,
  add column if not exists api_access         boolean   not null default false,
  add column if not exists webhooks_enabled   boolean   not null default false,
  add column if not exists white_label        boolean   not null default false,
  add column if not exists acquisition_source text;

-- Set limits based on existing plan_slug
update workspaces set
  leads_limit      = case plan_slug
                       when 'starter'    then 100
                       when 'team'       then 500
                       when 'scale'      then 2147483647  -- unlimited
                       else 100
                     end,
  seats_limit      = case plan_slug
                       when 'starter'    then 1
                       when 'team'       then 10
                       when 'scale'      then 2147483647
                       else 3
                     end,
  api_access       = (plan_slug = 'scale'),
  webhooks_enabled = (plan_slug in ('team', 'scale')),
  white_label      = (plan_slug = 'scale');

-- ─────────────────────────────────────────────
-- 2. API Keys table
-- ─────────────────────────────────────────────

create table if not exists api_keys (
  id           text        primary key default gen_random_uuid()::text,
  workspace_id text        not null references workspaces(id) on delete cascade,
  created_by   text        not null,  -- user_id (supabase_auth_id)
  name         text        not null,
  key_hash     text        not null unique,   -- bcrypt/sha256 of raw key
  key_prefix   text        not null,          -- first 8 chars shown in UI (e.g. "aim_k1a2")
  scopes       text[]      not null default '{}', -- e.g. ['read:leads','write:leads']
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_api_keys_workspace   on api_keys(workspace_id);
create index if not exists idx_api_keys_hash        on api_keys(key_hash) where revoked_at is null;
create index if not exists idx_api_keys_prefix      on api_keys(key_prefix);

alter table api_keys enable row level security;

drop policy if exists api_keys_select on api_keys;
create policy api_keys_select on api_keys
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = api_keys.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists api_keys_insert on api_keys;
create policy api_keys_insert on api_keys
for insert with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = api_keys.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists api_keys_update on api_keys;
create policy api_keys_update on api_keys
for update using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = api_keys.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- ─────────────────────────────────────────────
-- 3. Webhook subscriptions
-- ─────────────────────────────────────────────

create table if not exists webhook_subscriptions (
  id           text        primary key default gen_random_uuid()::text,
  workspace_id text        not null references workspaces(id) on delete cascade,
  created_by   text        not null,
  name         text        not null,
  url          text        not null,
  secret_hash  text        not null,   -- sha256 of signing secret (stored hashed)
  events       text[]      not null default '{}',  -- ['lead.created','lead.analyzed',...]
  is_active    boolean     not null default true,
  last_triggered_at timestamptz,
  failure_count     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_webhooks_workspace  on webhook_subscriptions(workspace_id);
create index if not exists idx_webhooks_active     on webhook_subscriptions(workspace_id, is_active) where is_active = true;

alter table webhook_subscriptions enable row level security;

drop policy if exists webhooks_select on webhook_subscriptions;
create policy webhooks_select on webhook_subscriptions
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = webhook_subscriptions.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists webhooks_insert on webhook_subscriptions;
create policy webhooks_insert on webhook_subscriptions
for insert with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = webhook_subscriptions.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists webhooks_update on webhook_subscriptions;
create policy webhooks_update on webhook_subscriptions
for update using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = webhook_subscriptions.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists webhooks_delete on webhook_subscriptions;
create policy webhooks_delete on webhook_subscriptions
for delete using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = webhook_subscriptions.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- ─────────────────────────────────────────────
-- 4. Webhook deliveries (delivery log + retry tracking)
-- ─────────────────────────────────────────────

create table if not exists webhook_deliveries (
  id              text        primary key default gen_random_uuid()::text,
  subscription_id text        not null references webhook_subscriptions(id) on delete cascade,
  workspace_id    text        not null,
  event_name      text        not null,
  payload         jsonb       not null default '{}'::jsonb,
  status          text        not null default 'pending',  -- pending|delivered|failed
  http_status     integer,
  response_body   text,
  attempt_count   integer     not null default 0,
  next_retry_at   timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_webhook_deliveries_sub     on webhook_deliveries(subscription_id, created_at desc);
create index if not exists idx_webhook_deliveries_retry   on webhook_deliveries(next_retry_at) where status = 'pending';
create index if not exists idx_webhook_deliveries_ws      on webhook_deliveries(workspace_id, created_at desc);

-- deliveries are insert-only from service role; members can read
alter table webhook_deliveries enable row level security;

drop policy if exists webhook_deliveries_select on webhook_deliveries;
create policy webhook_deliveries_select on webhook_deliveries
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = webhook_deliveries.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- ─────────────────────────────────────────────
-- 5. Outreach templates
-- ─────────────────────────────────────────────

create table if not exists outreach_templates (
  id           text        primary key default gen_random_uuid()::text,
  workspace_id text        not null references workspaces(id) on delete cascade,
  created_by   text        not null,
  name         text        not null,
  channel      text        not null default 'email',  -- email|linkedin|call
  stage        text        not null default 'cold',   -- cold|followup|closing
  subject      text,       -- for email templates
  body         text        not null,
  variables    text[]      not null default '{}',    -- ['{{company}}','{{contact_name}}']
  is_shared    boolean     not null default true,    -- visible to all workspace members
  use_count    integer     not null default 0,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_templates_workspace on outreach_templates(workspace_id, channel, stage);
create index if not exists idx_templates_shared    on outreach_templates(workspace_id, is_shared) where is_shared = true;

drop trigger if exists outreach_templates_updated_at on outreach_templates;
create trigger outreach_templates_updated_at
  before update on outreach_templates
  for each row execute function update_updated_at();

alter table outreach_templates enable row level security;

drop policy if exists templates_select on outreach_templates;
create policy templates_select on outreach_templates
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = outreach_templates.workspace_id
      and wm.user_id = auth.uid()::text
  )
  and (is_shared = true or created_by = auth.uid()::text)
);

drop policy if exists templates_insert on outreach_templates;
create policy templates_insert on outreach_templates
for insert with check (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = outreach_templates.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists templates_update on outreach_templates;
create policy templates_update on outreach_templates
for update using (
  created_by = auth.uid()::text
  or exists (
    select 1 from workspace_members wm
    where wm.workspace_id = outreach_templates.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists templates_delete on outreach_templates;
create policy templates_delete on outreach_templates
for delete using (
  created_by = auth.uid()::text
  or exists (
    select 1 from workspace_members wm
    where wm.workspace_id = outreach_templates.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- ─────────────────────────────────────────────
-- 6. Archived leads view (soft-deleted)
-- ─────────────────────────────────────────────

-- Helper for restore flow: just a view, no extra table needed
create or replace view archived_leads as
  select * from leads where deleted_at is not null;

-- ─────────────────────────────────────────────
-- 7. Plan limits enforcement function
-- ─────────────────────────────────────────────

create or replace function check_leads_limit()
returns trigger language plpgsql as $$
declare
  current_count integer;
  workspace_limit integer;
begin
  select count(*) into current_count
    from leads
   where workspace_id = new.workspace_id
     and deleted_at is null;

  select leads_limit into workspace_limit
    from workspaces
   where id = new.workspace_id;

  if current_count >= workspace_limit then
    raise exception 'leads_limit_reached: workspace % has reached its plan limit of % leads',
      new.workspace_id, workspace_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_leads_limit on leads;
create trigger enforce_leads_limit
  before insert on leads
  for each row execute function check_leads_limit();
