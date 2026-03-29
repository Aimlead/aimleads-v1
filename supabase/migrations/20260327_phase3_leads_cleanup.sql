-- Phase 3: leads table cleanup (idempotent)
-- Prerequisite: application code must already read from score_details jsonb.
-- Backfills intermediate scoring data into score_details, then drops 13 redundant columns.

-- Step 1: backfill score_details from flat columns (skip if columns already dropped)
do $$ begin
  update leads
  set score_details = coalesce(score_details, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'icp_raw_score',      icp_raw_score,
    'icp_score',          icp_score,
    'icp_priority',       icp_priority,
    'icp_category',       icp_category,
    'recommended_action', recommended_action,
    'ai_signals',         ai_signals,
    'scoring_weights',    scoring_weights
  ))
  where
    icp_raw_score      is not null
    or icp_score       is not null
    or icp_priority    is not null
    or icp_category    is not null
    or recommended_action is not null
    or ai_signals      is not null
    or scoring_weights is not null;
exception when undefined_column then
  raise notice 'score_details backfill skipped: columns already dropped';
end $$;

-- Step 2: merge generated_icebreaker (text) → generated_icebreakers (jsonb)
do $$ begin
  update leads
  set generated_icebreakers = jsonb_build_array(generated_icebreaker)
  where generated_icebreaker is not null
    and (generated_icebreakers is null or generated_icebreakers = '[]'::jsonb);
exception when undefined_column then
  raise notice 'generated_icebreaker merge skipped: column already dropped';
end $$;

-- Step 3: merge ai_summary → analysis_summary
do $$ begin
  update leads
  set analysis_summary = ai_summary
  where ai_summary is not null
    and (analysis_summary is null or analysis_summary = '');
exception when undefined_column then
  raise notice 'ai_summary merge skipped: column already dropped';
end $$;

-- Step 4: merge signals → intent_signals
do $$ begin
  update leads
  set intent_signals = signals
  where signals is not null
    and (intent_signals is null or intent_signals = '[]'::jsonb or intent_signals = '{}'::jsonb);
exception when undefined_column then
  raise notice 'signals merge skipped: column already dropped';
end $$;

-- Step 5: drop redundant columns (all IF EXISTS — safe on re-run)
alter table leads
  drop column if exists icp_raw_score,
  drop column if exists icp_score,
  drop column if exists icp_priority,
  drop column if exists icp_category,
  drop column if exists recommended_action,
  drop column if exists ai_signals,
  drop column if exists scoring_weights,
  drop column if exists signals,
  drop column if exists ai_summary,
  drop column if exists icp_profile_name,
  drop column if exists generated_icebreaker,
  drop column if exists final_status,
  drop column if exists owner_user_id;
