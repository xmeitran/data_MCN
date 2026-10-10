-- TikTok Shop -> Supabase
-- Chạy trong Supabase: SQL Editor -> dán file này -> Run

-- 1. Tài khoản đã authorize app (creator / seller) + token
create table if not exists public.tts_connections (
  id uuid primary key default gen_random_uuid(),
  open_id text unique not null,
  user_type smallint,                       -- 0 = seller, 1 = creator
  display_name text,
  access_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token text not null,
  refresh_token_expires_at timestamptz not null,
  granted_scopes text[],
  status text not null default 'active'
    check (status in ('active', 'reauth_required', 'revoked')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Toàn bộ dữ liệu API, lưu nguyên JSON (không mất trường nào)
--    record_key của bảng snapshot có kèm ngày -> giữ được lịch sử theo ngày
create table if not exists public.tts_raw_records (
  connection_id uuid not null references public.tts_connections(id) on delete cascade,
  endpoint_key text not null,
  record_key text not null,
  payload jsonb not null,
  snapshot_date date,
  first_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (connection_id, endpoint_key, record_key)
);
create index if not exists tts_raw_records_endpoint_idx
  on public.tts_raw_records (endpoint_key, snapshot_date);
create index if not exists tts_raw_records_payload_idx
  on public.tts_raw_records using gin (payload);

-- 3. Nhật ký mỗi lần đồng bộ
create table if not exists public.tts_sync_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  stats jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb
);

-- 4. Bảo mật: bật RLS, KHÔNG tạo policy public.
--    Chỉ server (secret key) đọc/ghi được -> token không lộ ra trình duyệt.
alter table public.tts_connections  enable row level security;
alter table public.tts_raw_records  enable row level security;
alter table public.tts_sync_runs    enable row level security;

-- 5. View tiện dùng cho CRM (security_invoker để view tôn trọng RLS)
create or replace view public.tts_creator_profiles
with (security_invoker = true) as
select
  c.id as connection_id,
  c.open_id,
  c.display_name,
  c.status,
  r.snapshot_date,
  r.payload,
  r.synced_at
from public.tts_raw_records r
join public.tts_connections c on c.id = r.connection_id
where r.endpoint_key = 'creator_profile';
