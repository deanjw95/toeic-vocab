-- Sync storage for the TOEIC vocab app.
-- No user accounts: each "space" is identified by the SHA-256 of a random sync key
-- that only the user's devices know. Tables are closed to the public API (RLS on,
-- no policies); only the edge functions, using the service role, read and write them.

create table public.spaces (
  id text primary key,                 -- sha256(sync key), hex
  created_at timestamptz not null default now(),
  tg_chat_id bigint,
  tg_link_code text unique,
  tg_link_expires timestamptz,
  sent_slots jsonb not null default '{}'::jsonb  -- {"0800": "2026-11-24", ...} last KST date sent
);

create sequence public.items_seq;

-- One row per synced record. kind: entry | card | log | settings.
-- data null = deleted. updated_at is the client clock in ms; newer wins.
create table public.items (
  space text not null references public.spaces(id) on delete cascade,
  kind text not null check (kind in ('entry', 'card', 'log', 'settings')),
  id text not null,
  data jsonb,
  updated_at bigint not null,
  seq bigint not null default nextval('public.items_seq'),
  primary key (space, kind, id)
);

create index items_space_seq on public.items (space, seq);

alter table public.spaces enable row level security;
alter table public.items enable row level security;

-- Upsert a batch, keeping the newer version of each row. Returns the highest seq after the write.
create or replace function public.push_items(p_space text, p_rows jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into items (space, kind, id, data, updated_at, seq)
  select p_space, r->>'kind', r->>'id', nullif(r->'data', 'null'::jsonb), (r->>'updated_at')::bigint, nextval('items_seq')
  from jsonb_array_elements(p_rows) r
  on conflict (space, kind, id) do update
    set data = excluded.data, updated_at = excluded.updated_at, seq = excluded.seq
    where items.updated_at <= excluded.updated_at;
  return coalesce((select max(seq) from items where space = p_space), 0);
end;
$$;

revoke all on function public.push_items(text, jsonb) from public, anon, authenticated;
