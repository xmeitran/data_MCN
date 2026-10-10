-- Prevent overlapping TikTok sync jobs from multiplying API traffic.
create unique index if not exists tts_sync_runs_one_running_idx
  on public.tts_sync_runs (status)
  where status = 'running';
