-- Phase 5: icp_profiles cleanup
-- Low risk — drops an unused column, adds updated_at tracking.

-- Drop owner_user_id (workspace resource, not user-owned; ignored by RLS anyway)
alter table icp_profiles
  drop column if exists owner_user_id;

-- Add updated_at column
alter table icp_profiles
  add column if not exists updated_at timestamptz not null default now();

-- Backfill updated_at from created_at for existing rows (created_date already renamed in phase 0)
do $$ begin
  update icp_profiles
  set updated_at = coalesce(created_at, now())
  where updated_at = now();
exception when others then null;
end $$;

-- Auto-update trigger
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists icp_profiles_updated_at on icp_profiles;
create trigger icp_profiles_updated_at
  before update on icp_profiles
  for each row execute function update_updated_at();

-- Rename created_date → created_at for consistency (icp_profiles used created_date, not created_at)
-- NOTE: only run if the column is named created_date in your instance.
do $$ begin
  alter table icp_profiles rename column created_date to created_at;
exception when undefined_column then null;
end $$;
