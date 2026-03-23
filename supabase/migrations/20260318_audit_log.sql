-- Audit log table — tracks all write operations on leads and ICP profiles
create table if not exists audit_log (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null,
  action text not null,         -- 'create' | 'update' | 'delete'
  resource_type text not null,  -- 'lead' | 'icp_profile'
  resource_id text not null,
  changes jsonb,                -- snapshot of changed fields (new values)
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_workspace on audit_log(workspace_id, created_at desc);
create index if not exists idx_audit_log_resource on audit_log(resource_type, resource_id);

alter table audit_log enable row level security;

drop policy if exists audit_log_select on audit_log;
create policy audit_log_select on audit_log
for select using (
  exists (
    select 1
    from users u
    where u.workspace_id = audit_log.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = audit_log.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log
for insert with check (
  exists (
    select 1
    from users u
    where u.workspace_id = audit_log.workspace_id
      and u.supabase_auth_id = auth.uid()::text
  )
  or exists (
    select 1
    from workspace_members wm
    where wm.workspace_id = audit_log.workspace_id
      and wm.user_id = auth.uid()::text
  )
);
