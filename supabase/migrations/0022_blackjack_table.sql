-- Office Bets — shared multiplayer Blackjack table
--
-- One perpetual "room" (a singleton row, enforced by the unconditional
-- unique index below) that up to 5 players can sit at. Seats persist across
-- rounds — once seated, a player stays at the table until they explicitly
-- leave, rather than needing to re-join every round. The table cycles
-- betting -> player_turns -> dealer_turn -> resolved -> betting forever,
-- same client-driven atomic-claim phase engine as roulette_rounds (no
-- backend/cron exists in this app — whichever connected client's local
-- timer gets there first drives the transition, filtered on the expected
-- current status so simultaneous triggers from other open tabs are
-- harmless no-ops).

create table blackjack_table (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'betting' check (status in ('betting', 'player_turns', 'dealer_turn', 'resolved')),
  betting_closes_at timestamptz not null,
  dealer_cards jsonb,
  current_seat_index int,
  turn_ends_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- (true) is the same value for every row, so this caps the table at exactly
-- one row ever — simpler than roulette's partial index since this room
-- never truly goes away, it just cycles through "resolved" and back.
create unique index blackjack_table_singleton on blackjack_table ((true));

create table blackjack_table_seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references blackjack_table(id) on delete cascade,
  seat_index int not null check (seat_index >= 0 and seat_index < 5),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'seated' check (status in ('seated', 'playing', 'stood', 'bust', 'blackjack', 'resolved')),
  bet_amount numeric check (bet_amount is null or bet_amount > 0),
  player_cards jsonb,
  outcome text check (outcome in ('win', 'lose', 'push', 'blackjack')),
  payout numeric,
  joined_at timestamptz not null default now()
);

create unique index blackjack_table_seats_seat_idx on blackjack_table_seats (table_id, seat_index);
create unique index blackjack_table_seats_user_idx on blackjack_table_seats (table_id, user_id);
create index blackjack_table_seats_table_id_idx on blackjack_table_seats (table_id);

alter publication supabase_realtime add table blackjack_table, blackjack_table_seats;

alter table blackjack_table enable row level security;
alter table blackjack_table_seats enable row level security;

create policy "anon select" on blackjack_table for select using (true);
create policy "anon insert" on blackjack_table for insert with check (true);
create policy "anon update" on blackjack_table for update using (true) with check (true);

create policy "anon select" on blackjack_table_seats for select using (true);
create policy "anon insert" on blackjack_table_seats for insert with check (true);
create policy "anon update" on blackjack_table_seats for update using (true) with check (true);
create policy "anon delete" on blackjack_table_seats for delete using (true);

-- Reuses the existing 'blackjack' transaction type — no schema change
-- needed there, a table hand's stake/payout is still just a blackjack
-- ledger entry.
