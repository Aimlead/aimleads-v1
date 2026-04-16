-- Minimal local-like seed for Supabase (optional)
-- Replace IDs/emails before production use.

insert into workspaces (id, name)
values ('ws_demo', 'Demo Workspace')
on conflict (id) do nothing;

insert into users (id, workspace_id, email, full_name, supabase_auth_id, password_hash)
values (
  'user_demo',
  'ws_demo',
  'demo@aimleads.local',
  'Demo User',
  null,
  null
)
on conflict (id) do nothing;

insert into workspace_members (workspace_id, user_id, role)
values ('ws_demo', 'user_demo', 'owner')
on conflict (workspace_id, user_id) do nothing;