-- Add missing signal columns used by discovery + reanalysis flows.
alter table if exists leads
  add column if not exists internet_signals jsonb,
  add column if not exists auto_signal_metadata jsonb;