-- Migration: Credits system + RLS security fixes
-- Date: 2026-04-11
-- Run in Supabase SQL Editor (staging then production).

-- ─────────────────────────────────────────────────────────────────
-- 1. RLS FIX: demo_requests and analytics_events (public tables)
--    These tables had no RLS, allowing direct Supabase reads by anyone
--    with the anon key (email harvesting, unbounded inserts).
-- ─────────────────────────────────────────────────────────────────

alter table demo_requests enable row level security;

drop policy if exists demo_requests_public_insert on demo_requests;
create policy demo_requests_public_insert on demo_requests
  for insert with check (true);
-- SELECT/UPDATE/DELETE: blocked for all non-service-role (no policy = blocked)

alter table analytics_events enable row level security;

drop policy if exists analytics_events_public_insert on analytics_events;
create policy analytics_events_public_insert on analytics_events
  for insert with check (true);
-- SELECT/UPDATE/DELETE: blocked for all non-service-role (no policy = blocked)

-- ─────────────────────────────────────────────────────────────────
-- 2. RLS FIX: audit_log insert — enforce user_id = auth.uid()
--    Previous policy verified the inserter is a workspace member
--    but did NOT validate that user_id = the authenticated user.
--    This allowed forging audit entries under another user's identity.
-- ─────────────────────────────────────────────────────────────────

drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log
  for insert with check (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = audit_log.workspace_id
        and wm.user_id = auth.uid()::text
    )
    and audit_log.user_id = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. CREDITS: Add credit_balance column to workspaces
--    Default = 50 so all new workspaces start with trial credits.
--    Existing workspaces also receive 50 credits (dev/test only currently).
-- ─────────────────────────────────────────────────────────────────

alter table workspaces
  add column if not exists credit_balance integer not null default 50;

-- ─────────────────────────────────────────────────────────────────
-- 4. CREDITS: credit_transactions table
--    Immutable ledger. Positive amount = credit added, negative = consumed.
--    balance_after is a snapshot for quick history display.
-- ─────────────────────────────────────────────────────────────────

create table if not exists credit_transactions (
  id            text        primary key default gen_random_uuid()::text,
  workspace_id  text        not null references workspaces(id) on delete cascade,
  user_id       text,                    -- who triggered it (null = admin/system)
  action        text        not null,    -- 'grant' | 'trial' | 'purchase' | 'analyze' | 'discover_signals' | 'sequence' | 'icp_generate' | 'analytics_insights' | 'adjustment'
  amount        integer     not null,    -- positive = added, negative = consumed
  balance_after integer     not null,    -- snapshot of balance after this transaction
  description   text,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_credit_tx_workspace
  on credit_transactions(workspace_id, created_at desc);

alter table credit_transactions enable row level security;

-- Workspace members can read their own credit history
drop policy if exists credit_tx_select on credit_transactions;
create policy credit_tx_select on credit_transactions
  for select using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = credit_transactions.workspace_id
        and wm.user_id = auth.uid()::text
    )
  );

-- No INSERT/UPDATE/DELETE for regular users — service role only

-- ─────────────────────────────────────────────────────────────────
-- 5. CREDITS: deduct_credits() RPC function
--    Atomic: locks the workspace row, checks balance, deducts, logs.
--    Returns JSON: { success, balance, deducted } or { success: false, error, balance }
-- ─────────────────────────────────────────────────────────────────

create or replace function deduct_credits(
  p_workspace_id text,
  p_user_id      text,
  p_action       text,
  p_amount       integer,
  p_description  text    default null,
  p_metadata     jsonb   default '{}'
) returns jsonb language plpgsql security definer as $$
declare
  v_current_balance integer;
  v_new_balance     integer;
  v_tx_id           text;
begin
  -- Lock the workspace row to prevent concurrent overdrafts
  select credit_balance into v_current_balance
  from workspaces
  where id = p_workspace_id
  for update;

  if v_current_balance is null then
    return jsonb_build_object(
      'success', false,
      'error',   'workspace_not_found',
      'balance', 0
    );
  end if;

  if v_current_balance < p_amount then
    return jsonb_build_object(
      'success', false,
      'error',   'insufficient_credits',
      'balance', v_current_balance
    );
  end if;

  v_new_balance := v_current_balance - p_amount;
  v_tx_id       := gen_random_uuid()::text;

  update workspaces
  set credit_balance = v_new_balance
  where id = p_workspace_id;

  insert into credit_transactions
    (id, workspace_id, user_id, action, amount, balance_after, description, metadata)
  values
    (v_tx_id, p_workspace_id, p_user_id, p_action, -p_amount, v_new_balance, p_description, p_metadata);

  return jsonb_build_object(
    'success',  true,
    'balance',  v_new_balance,
    'deducted', p_amount
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. CREDITS: grant_credits() RPC function
--    Used for trial, admin grants, and future Stripe webhook credits.
-- ─────────────────────────────────────────────────────────────────

create or replace function grant_credits(
  p_workspace_id text,
  p_amount       integer,
  p_action       text    default 'grant',
  p_description  text    default null,
  p_metadata     jsonb   default '{}'
) returns jsonb language plpgsql security definer as $$
declare
  v_current_balance integer;
  v_new_balance     integer;
  v_tx_id           text;
begin
  select credit_balance into v_current_balance
  from workspaces
  where id = p_workspace_id
  for update;

  if v_current_balance is null then
    return jsonb_build_object(
      'success', false,
      'error',   'workspace_not_found'
    );
  end if;

  v_new_balance := v_current_balance + p_amount;
  v_tx_id       := gen_random_uuid()::text;

  update workspaces
  set credit_balance = v_new_balance
  where id = p_workspace_id;

  insert into credit_transactions
    (id, workspace_id, user_id, action, amount, balance_after, description, metadata)
  values
    (v_tx_id, p_workspace_id, null, p_action, p_amount, v_new_balance, p_description, p_metadata);

  return jsonb_build_object(
    'success', true,
    'balance', v_new_balance,
    'granted', p_amount
  );
end;
$$;
