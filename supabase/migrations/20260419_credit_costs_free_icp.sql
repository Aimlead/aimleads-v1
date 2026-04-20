-- Migration: 2026-04-19
-- Purpose: align Supabase ledger with new credit pricing.
--
-- Changes shipped in this release:
--   1) score_icp is now 100% deterministic (no LLM call) -> 0 credits.
--   2) Free plan unlocks 1 CRM integration during the trial so users can
--      validate the loop end-to-end before upgrading.
--   3) discover_signals stays at 10 credits (UI was previously showing
--      "3 credits" by mistake — corrected client-side).
--
-- This migration is idempotent and safe to re-run.
-- It does NOT change schema, only data + a documentation comment table.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Document the canonical credit cost matrix in a tiny config table so the
--    SQL world stays in sync with server/lib/credits.js (CREDIT_COSTS).
--    The Express server is still the source of truth at runtime.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_action_costs (
  action      text PRIMARY KEY,
  cost        integer NOT NULL CHECK (cost >= 0),
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO credit_action_costs (action, cost, description) VALUES
  ('analyze',             1,  'Single lead AI analysis'),
  ('score_icp',           0,  'Deterministic ICP scoring — no LLM, no charge'),
  ('reanalyze_llm',       3,  'Full LLM re-analysis of an existing lead'),
  ('discover_signals',    10, 'External web + news signal discovery'),
  ('sequence',            3,  'AI multi-touch outreach sequence generation'),
  ('icp_generate',        3,  'AI ICP profile generation from natural language'),
  ('analytics_insights',  2,  'AI-generated analytics insights')
ON CONFLICT (action) DO UPDATE
  SET cost        = EXCLUDED.cost,
      description = EXCLUDED.description,
      updated_at  = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Free plan: grant 1 CRM integration slot during trial.
--    Plans entitlements live in server/lib/plans.js but we mirror the change
--    into a JSONB metadata column on workspaces if present so reporting stays
--    consistent.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'plan_metadata'
  ) THEN
    UPDATE workspaces
       SET plan_metadata = COALESCE(plan_metadata, '{}'::jsonb)
                          || jsonb_build_object('crm_integrations', 1)
     WHERE plan_slug = 'free';
  END IF;
END
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Comment hooks for ops visibility.
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE credit_action_costs IS
  'Canonical credit cost per action. Mirrors server/lib/credits.js CREDIT_COSTS. Source of truth at runtime is the Express server.';

COMMIT;
