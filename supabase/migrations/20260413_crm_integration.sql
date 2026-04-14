-- Migration: CRM Integration — HubSpot & Salesforce
-- Date: 2026-04-13
-- Run in Supabase SQL Editor (staging then production).

-- ─────────────────────────────────────────────────────────────────
-- 1. crm_integrations: one row per CRM type per workspace
--    Stores the API token (plaintext for MVP — encrypt post-GA)
--    and any CRM-specific config (e.g. Salesforce instance_url).
-- ─────────────────────────────────────────────────────────────────

create table if not exists crm_integrations (
  id              text        primary key,
  workspace_id    text        not null references workspaces(id) on delete cascade,
  crm_type        text        not null check (crm_type in ('hubspot', 'salesforce')),
  api_token       text        not null,
  -- HubSpot: {}
  -- Salesforce: { "instance_url": "https://myco.salesforce.com" }
  config          jsonb       not null default '{}',
  is_active       boolean     not null default true,
  last_tested_at  timestamptz,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, crm_type)
  -- TODO: encrypt api_token using pgp_sym_encrypt before GA
);

create index if not exists idx_crm_integrations_workspace
  on crm_integrations(workspace_id);

-- Reuse existing update_updated_at trigger function
drop trigger if exists crm_integrations_updated_at on crm_integrations;
create trigger crm_integrations_updated_at
  before update on crm_integrations
  for each row execute function update_updated_at();

alter table crm_integrations enable row level security;

-- Workspace members can read integrations (tokens are masked at the API layer)
drop policy if exists crm_integrations_select on crm_integrations;
create policy crm_integrations_select on crm_integrations
  for select using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = crm_integrations.workspace_id
        and wm.user_id = auth.uid()::text
    )
  );

-- Only owners and admins can write/modify integrations
drop policy if exists crm_integrations_modify on crm_integrations;
create policy crm_integrations_modify on crm_integrations
  for all using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = crm_integrations.workspace_id
        and wm.user_id = auth.uid()::text
        and wm.role in ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 2. crm_sync_records: one row per lead per sync attempt
--    Immutable — written by the backend service role only.
--    Tracks external CRM object IDs and sync status.
-- ─────────────────────────────────────────────────────────────────

create table if not exists crm_sync_records (
  id              text        primary key,
  workspace_id    text        not null references workspaces(id) on delete cascade,
  lead_id         text        not null references leads(id) on delete cascade,
  crm_type        text        not null,
  crm_object_id   text,                    -- HubSpot contact ID / Salesforce Lead ID
  crm_object_type text,                    -- 'contact' | 'lead'
  crm_object_url  text,                    -- direct deep-link into the CRM
  direction       text        not null default 'push',
  status          text        not null check (status in ('success', 'failed', 'pending')),
  synced_at       timestamptz,
  error_message   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_crm_sync_records_lead
  on crm_sync_records(lead_id, crm_type);

create index if not exists idx_crm_sync_records_workspace
  on crm_sync_records(workspace_id, created_at desc);

alter table crm_sync_records enable row level security;

-- Workspace members can read their sync history
drop policy if exists crm_sync_records_select on crm_sync_records;
create policy crm_sync_records_select on crm_sync_records
  for select using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = crm_sync_records.workspace_id
        and wm.user_id = auth.uid()::text
    )
  );

-- INSERT/UPDATE/DELETE: service role only (no client-facing policy)
