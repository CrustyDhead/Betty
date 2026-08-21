-- Office Bets — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) once a
-- project exists. Matches the data model in office-bets-app-design-spec.md
-- section 6, plus the decisions made when scaffolding:
--   * open self-signup (no fixed roster table) gated by a shared team PIN
--     enforced at the app level, not by Supabase Auth
--   * self-betting is allowed (no subject-lockout constraint)
--   * defaults: 1,000 starting balance, 100/week stipend, 10 min wager

create extension if not exists "pgcrypto";

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  token_balance numeric not null default 1000,
  last_stipend_at timestamptz,
  created_at timestamptz not null default now()
);

create table bets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  subject_user_id uuid references users(id) on delete set null,
  creator_id uuid not null references users(id) on delete cascade,
  lock_time timestamptz not null,
  status text not null default 'open' check (status in ('open', 'locked', 'resolved', 'void')),
  outcome text check (outcome in ('yes', 'no')),
  created_at timestamptz not null default now()
);

create table wagers (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  side text not null check (side in ('yes', 'no')),
  amount numeric not null check (amount > 0),
  payout numeric,
  created_at timestamptz not null default now(),
  unique (bet_id, user_id, side)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('stipend', 'wager', 'payout', 'refund')),
  amount numeric not null,
  timestamp timestamptz not null default now()
);

create index wagers_bet_id_idx on wagers (bet_id);
create index wagers_user_id_idx on wagers (user_id);
create index transactions_user_id_idx on transactions (user_id);

-- Realtime: let the client subscribe to live pool changes on bets/wagers.
alter publication supabase_realtime add table bets, wagers, users;

-- RLS: auth is a shared team PIN checked client-side, not Supabase Auth,
-- so there's no per-row user identity to key policies off of. Keep it
-- permissive for the anon role — matches "zero real security stakes" in
-- the spec. Tighten later if this ever leaves a trusted friend group.
alter table users enable row level security;
alter table bets enable row level security;
alter table wagers enable row level security;
alter table transactions enable row level security;

create policy "anon full access" on users for all using (true) with check (true);
create policy "anon full access" on bets for all using (true) with check (true);
create policy "anon full access" on wagers for all using (true) with check (true);
create policy "anon full access" on transactions for all using (true) with check (true);
