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
  set intent_signals = case
    when jsonb_typeof(signals) = 'object' then jsonb_build_object(
      'pre_call',
      case
        when jsonb_typeof(signals->'pre_call') = 'array' then signals->'pre_call'
        when jsonb_typeof(signals->'preCall') = 'array' then signals->'preCall'
        when jsonb_typeof(signals->'pre') = 'array' then signals->'pre'
        else '[]'::jsonb
      end,
      'post_contact',
      case
        when jsonb_typeof(signals->'post_contact') = 'array' then signals->'post_contact'
        when jsonb_typeof(signals->'postContact') = 'array' then signals->'postContact'
        when jsonb_typeof(signals->'post') = 'array' then signals->'post'
        else '[]'::jsonb
      end,
      'negative',
      case
        when jsonb_typeof(signals->'negative') = 'array' then signals->'negative'
        when jsonb_typeof(signals->'negatives') = 'array' then signals->'negatives'
        when jsonb_typeof(signals->'negative_signals') = 'array' then signals->'negative_signals'
        else '[]'::jsonb
      end
    )
    when jsonb_typeof(signals) = 'array' then jsonb_build_object(
      'pre_call',
      coalesce((
        select jsonb_agg(parsed.value order by parsed.first_seen)
        from (
          select value, min(ordinality) as first_seen
          from (
            select
              ordinality,
              case
                when jsonb_typeof(item) = 'string' then nullif(trim(both '"' from item::text), '')
                when jsonb_typeof(item) = 'object' then coalesce(
                  nullif(trim(item->>'key'), ''),
                  nullif(trim(item->>'signal'), ''),
                  nullif(trim(item->>'label'), '')
                )
                else null
              end as value,
              coalesce(lower(item->>'type'), 'positive') as signal_type
            from jsonb_array_elements(signals) with ordinality as elements(item, ordinality)
          ) flattened
          where value is not null and signal_type <> 'negative'
          group by value
        ) parsed
      ), '[]'::jsonb),
      'post_contact',
      '[]'::jsonb,
      'negative',
      coalesce((
        select jsonb_agg(parsed.value order by parsed.first_seen)
        from (
          select value, min(ordinality) as first_seen
          from (
            select
              ordinality,
              case
                when jsonb_typeof(item) = 'string' then nullif(trim(both '"' from item::text), '')
                when jsonb_typeof(item) = 'object' then coalesce(
                  nullif(trim(item->>'key'), ''),
                  nullif(trim(item->>'signal'), ''),
                  nullif(trim(item->>'label'), '')
                )
                else null
              end as value,
              coalesce(lower(item->>'type'), 'positive') as signal_type
            from jsonb_array_elements(signals) with ordinality as elements(item, ordinality)
          ) flattened
          where value is not null and signal_type = 'negative'
          group by value
        ) parsed
      ), '[]'::jsonb)
    )
    else jsonb_build_object(
      'pre_call', '[]'::jsonb,
      'post_contact', '[]'::jsonb,
      'negative', '[]'::jsonb
    )
  end
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
