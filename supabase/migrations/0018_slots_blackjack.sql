-- Office Bets — slots and blackjack mini-games
--
-- Both are single-player, instant/turn-driven — unlike roulette, neither
-- needs a shared round or timer, so there's no atomic-claim phase engine
-- here. Slots resolves in one write; blackjack is a sequence of player
-- actions (hit/stand) against a dealer that plays automatically once the
-- player stands.

create table slots_spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  reels jsonb not null,
  payout numeric not null default 0,
  created_at timestamptz not null default now()
);

create index slots_spins_user_id_idx on slots_spins (user_id);

alter publication supabase_realtime add table slots_spins;
alter table slots_spins enable row level security;
create policy "anon select" on slots_spins for select using (true);
create policy "anon insert" on slots_spins for insert with check (true);

create table blackjack_hands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  bet_amount numeric not null check (bet_amount > 0),
  player_cards jsonb not null,
  dealer_cards jsonb not null,
  status text not null default 'player_turn' check (status in ('player_turn', 'resolved')),
  outcome text check (outcome in ('win', 'lose', 'push', 'blackjack')),
  payout numeric,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index blackjack_one_active_hand_per_user on blackjack_hands (user_id) where status = 'player_turn';
create index blackjack_hands_user_id_idx on blackjack_hands (user_id);

alter publication supabase_realtime add table blackjack_hands;
alter table blackjack_hands enable row level security;
create policy "anon select" on blackjack_hands for select using (true);
create policy "anon insert" on blackjack_hands for insert with check (true);
create policy "anon update" on blackjack_hands for update using (true) with check (true);

-- New transaction types, same pattern as 0008_transfer_type.sql.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table transactions drop constraint %I', con.conname);
  end loop;
end $$;

alter table transactions
  add constraint transactions_type_check
  check (type in (
    'stipend', 'wager', 'payout', 'refund', 'transfer', 'roulette',
    'loan', 'repayment', 'adjustment', 'slots', 'blackjack'
  ));
