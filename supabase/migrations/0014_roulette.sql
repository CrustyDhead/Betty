-- Office Bets — lightning-style roulette
--
-- Continuous back-to-back rounds: everyone bets against the house on the
-- same shared round. Betting closes on a timer, 3 "lucky numbers" get a
-- random multiplier, the wheel spins, straight-up bets on a lucky number
-- that hits pay (base payout x multiplier) instead of standard odds.
--
-- No backend/cron exists in this app — every phase transition is triggered
-- by whichever connected client's local timer gets there first, same
-- atomic-claim pattern already used by resolveBet/voidBet (an update
-- filtered on the expected current status; only one caller's write lands).
-- The partial unique index below caps it at one non-resolved round at a
-- time, so concurrent "start the next round" attempts from multiple idle
-- clients can't create duplicates.

create table roulette_rounds (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'betting' check (status in ('betting', 'spinning', 'resolved')),
  betting_closes_at timestamptz not null,
  lucky_numbers jsonb,
  winning_number int check (winning_number >= 0 and winning_number <= 36),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index roulette_one_active_round on roulette_rounds ((true)) where status <> 'resolved';

create table roulette_bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references roulette_rounds(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  bet_type text not null check (bet_type in ('number', 'red', 'black', 'odd', 'even', 'low', 'high')),
  bet_value text,
  amount numeric not null check (amount > 0),
  payout numeric,
  created_at timestamptz not null default now()
);

create index roulette_bets_round_id_idx on roulette_bets (round_id);
create index roulette_bets_user_id_idx on roulette_bets (user_id);

alter publication supabase_realtime add table roulette_rounds, roulette_bets;

alter table roulette_rounds enable row level security;
alter table roulette_bets enable row level security;

create policy "anon select" on roulette_rounds for select using (true);
create policy "anon insert" on roulette_rounds for insert with check (true);
create policy "anon update" on roulette_rounds for update using (true) with check (true);

create policy "anon select" on roulette_bets for select using (true);
create policy "anon insert" on roulette_bets for insert with check (true);
create policy "anon update" on roulette_bets for update using (true) with check (true);

-- New transaction type for stake debits and winnings credits, same pattern
-- as 0008_transfer_type.sql.
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
  check (type in ('stipend', 'wager', 'payout', 'refund', 'transfer', 'roulette'));
