-- Migration: CRM token hardening follow-up
-- Date: 2026-04-15
-- Purpose:
--   1. Enable pgcrypto for production-grade CRM secret handling.
--   2. Remove the stale plaintext/TODO messaging left by the initial CRM migration.
--   3. Prepare a database-level encrypted mirror column for future RPC-based reads/writes.

create extension if not exists pgcrypto;

alter table if exists crm_integrations
  add column if not exists api_token_encrypted bytea;

comment on column crm_integrations.api_token is
  'Application-layer encrypted CRM token payload. API never returns the raw token.';

comment on column crm_integrations.api_token_encrypted is
  'Optional pgcrypto-encrypted mirror of the CRM token for phased migration to database-managed secret storage.';

do $$
declare
  crm_key text := nullif(current_setting('app.settings.crm_token_key', true), '');
begin
  if crm_key is null then
    raise notice 'Skipping crm_integrations.api_token_encrypted backfill because app.settings.crm_token_key is not set.';
    return;
  end if;

  update crm_integrations
     set api_token_encrypted = pgp_sym_encrypt(api_token, crm_key)
   where api_token is not null
     and api_token <> ''
     and api_token_encrypted is null;
end $$;
