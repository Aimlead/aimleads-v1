create table if not exists public.ai_runs (
  id text primary key,
  workspace_id text not null,
  lead_id text null,
  action text not null,
  provider text null,
  model text null,
  prompt_version text null,
  status text not null default 'running',
  duration_ms integer null,
  input_tokens integer null,
  output_tokens integer null,
  estimated_cost numeric(12, 6) null,
  request_payload jsonb null,
  response_payload jsonb null,
  error_message text null,
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_runs_workspace_created_idx
  on public.ai_runs (workspace_id, created_at desc);

create index if not exists ai_runs_action_created_idx
  on public.ai_runs (action, created_at desc);

create index if not exists ai_runs_lead_created_idx
  on public.ai_runs (lead_id, created_at desc);
