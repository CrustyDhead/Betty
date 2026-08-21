-- Office Bets — Phase 2: categories, disputes, comments
-- Run this after schema.sql. Adds the fields the app's Phase 2 features
-- (category filters, dispute/re-resolve, banter threads) need.

alter table bets
  add column category text not null default 'Custom' check (category in ('WFH', 'Sick', 'Late', 'Custom')),
  add column disputed boolean not null default false;

create table comments (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index comments_bet_id_idx on comments (bet_id);

alter publication supabase_realtime add table comments;

alter table comments enable row level security;
create policy "anon full access" on comments for all using (true) with check (true);
