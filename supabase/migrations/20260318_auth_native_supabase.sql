-- Supabase native auth migration for AimLeads
-- Run after creating auth users and setting users.supabase_auth_id.

alter table if exists users
  add column if not exists supabase_auth_id text;

create unique index if not exists idx_users_supabase_auth_id on users(supabase_auth_id);

-- Legacy local auth used password_hash as NOT NULL.
-- Keep it nullable when Supabase Auth is the source of truth.
alter table if exists users
  alter column password_hash drop not null;

-- Optional backfill: if a users row already has supabase_auth_id,
-- remap workspace member user_id to auth uid for RLS compatibility.
update workspace_members wm
set user_id = u.supabase_auth_id
from users u
where u.workspace_id = wm.workspace_id
  and wm.user_id = u.id
  and u.supabase_auth_id is not null
  and u.supabase_auth_id <> '';