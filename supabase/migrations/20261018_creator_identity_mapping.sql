-- A Partner connection can return many creators in CAP/order payloads.
-- Keep one creator per (connection, open_id), not one creator per connection.
alter table public.mcn_creators
  drop constraint if exists mcn_creators_connection_id_key;

create unique index if not exists mcn_creators_connection_open_id_idx
  on public.mcn_creators(connection_id, open_id);

alter table public.mcn_products
  add column if not exists creator_id uuid references public.mcn_creators(id) on delete set null;

create index if not exists mcn_products_creator_idx
  on public.mcn_products(creator_id, snapshot_date desc);
