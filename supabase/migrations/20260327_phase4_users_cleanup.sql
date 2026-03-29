-- Phase 4: users table cleanup

-- This phase is destructive and must not silently delete fixture workspaces.
-- Cleanup must be performed manually after reviewing affected rows.
do $$ begin
  raise notice 'Phase 4 requires explicit cleanup. Review fixture users/workspaces before running destructive user cleanup.';
end $$;

-- Step 1: make supabase_auth_id NOT NULL (safe now that fixture rows are gone)
-- Guard: only apply if no nulls remain (protects against partial cleanup)
do $$ begin
  if (select count(*) from users where supabase_auth_id is null) = 0 then
    alter table users alter column supabase_auth_id set not null;
  else
    raise notice 'Skipping NOT NULL constraint: % rows still have null supabase_auth_id',
      (select count(*) from users where supabase_auth_id is null);
  end if;
end $$;

-- Step 2: drop password_hash (legacy local auth — null for all Supabase Auth users)
alter table users
  drop column if exists password_hash;

-- Step 3: drop workspace_id (redundant with workspace_members)
alter table users
  drop column if exists workspace_id;
