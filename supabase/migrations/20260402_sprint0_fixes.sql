-- Sprint 0 — Quick fixes
-- 1. Add client_type column to leads (used in ICP scoring but was missing from schema)
-- 2. Add partial unique index on (workspace_id, lower(company_name)) to prevent duplicate leads
-- Run in Supabase SQL editor (staging then production).

-- ─────────────────────────────────────────────
-- 1. client_type on leads
-- ─────────────────────────────────────────────
alter table leads
  add column if not exists client_type text;

comment on column leads.client_type is
  'Lead client type (e.g. B2B, B2C, B2B2C). Matched against ICP typeClient weights during scoring.';

-- ─────────────────────────────────────────────
-- 2. Prevent duplicate active leads per workspace
-- Uses lower() for case-insensitive deduplication.
-- Partial index (WHERE deleted_at IS NULL) so soft-deleted rows don't block re-imports.
-- ─────────────────────────────────────────────
create unique index if not exists idx_leads_workspace_company_unique
  on leads (workspace_id, lower(company_name))
  where deleted_at is null;

-- Optional: also deduplicate on contact email when provided
create unique index if not exists idx_leads_workspace_email_unique
  on leads (workspace_id, lower(contact_email))
  where deleted_at is null and contact_email is not null and contact_email <> '';
