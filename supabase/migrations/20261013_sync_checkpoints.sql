-- Endpoint-level checkpoints make a rerun resume completed contexts for the same day.
create table if not exists public.tts_sync_checkpoints (
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  endpoint_key text not null,
  context_key text not null,
  snapshot_date date not null,
  status text not null check (status in ('success', 'failed')),
  record_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (connection_id, endpoint_key, context_key, snapshot_date)
);
create index if not exists tts_sync_checkpoints_date_idx
  on public.tts_sync_checkpoints (snapshot_date, status);
alter table public.tts_sync_checkpoints enable row level security;
