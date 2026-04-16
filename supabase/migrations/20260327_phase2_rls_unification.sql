-- Phase 2: RLS unification
-- Prerequisite: Phase 1 must have run (app_user_id backfill complete).
-- Prerequisite: workspace_members.user_id must all = supabase_auth_id.
-- Verify with: SELECT count(*) FROM workspace_members wm
--              LEFT JOIN users u ON u.supabase_auth_id = wm.user_id
--              WHERE u.id IS NULL AND wm.user_id NOT LIKE 'user_%';
-- Expected: 0 unmatched rows.
--
-- Replaces all dual-path OR policies with single workspace_members path.

-- workspaces
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

-- users: self + teammates via shared workspace
drop policy if exists users_select on users;
create policy users_select on users
for select using (
  users.supabase_auth_id = auth.uid()::text
  or exists (
    select 1
    from workspace_members wm_self
    join workspace_members wm_other on wm_other.workspace_id = wm_self.workspace_id
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

-- workspace_members: read by any member, write by owner only
drop policy if exists workspace_members_select on workspace_members;
create policy workspace_members_select on workspace_members
for select using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

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

-- workspace_invites
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

-- icp_profiles: all read; owner/admin write
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

-- leads: all members read/write
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

-- audit_log: all read; all insert; nobody deletes
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
