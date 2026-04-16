create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  flag_name text not null,
  enabled boolean not null default false,
  updated_by_user_id text,
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists feature_flags_workspace_flag_idx
  on public.feature_flags (workspace_id, flag_name);

create index if not exists feature_flags_workspace_idx
  on public.feature_flags (workspace_id);
