-- Office Bets — Texas Hold'em, 6-max, simplified no-limit
--
-- Same shared-table pattern as blackjack_table: one perpetual room, up to 6
-- seats, everything driven by whichever connected client's local timer gets
-- there first (atomic-claim updates, no backend/cron). No side pots: every
-- hand freezes a "hand_cap" = the smallest stack among players dealt into
-- that hand, and no bet/raise/call can ever push anyone's total commitment
-- past it — so nobody can ever be forced all-in for less than another
-- player's bet, which is exactly the situation side pots exist to handle.
--
-- Unlike every other game in this app, poker's hole cards are the entire
-- game — unlike blackjack's transiently-hidden dealer card, a leak here
-- breaks the game outright. So hole cards get real protection: they live
-- in their own table with NO select policy (default-deny for anon), and
-- can only be read back through the two SECURITY DEFINER functions below —
-- one that returns only the caller's own cards, one that reveals
-- still-active hands only once a hand has legitimately reached showdown.
-- Community cards and the remaining deck stay on poker_table itself
-- (readable, same as roulette's pre-computed winning number) — acceptable
-- under this app's existing "trusted friend group" model, just noted here
-- since it's a new instance of that same trade-off.

create table poker_table (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting'
    check (status in ('waiting', 'preflop', 'flop', 'turn', 'river', 'showdown', 'hand_over')),
  button_seat_index int,
  current_seat_index int,
  turn_ends_at timestamptz,
  acted_seat_indices jsonb not null default '[]',
  current_bet numeric not null default 0,
  min_raise numeric not null default 20,
  hand_cap numeric,
  pot numeric not null default 0,
  community_cards jsonb not null default '[]',
  deck jsonb,
  hand_number bigint not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index poker_table_singleton on poker_table ((true));

create table poker_table_seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references poker_table(id) on delete cascade,
  seat_index int not null check (seat_index >= 0 and seat_index < 6),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'seated' check (status in ('seated', 'active', 'folded', 'all_in')),
  hand_committed numeric not null default 0,
  street_committed numeric not null default 0,
  last_action text check (last_action in ('blind', 'fold', 'check', 'call', 'raise', 'all_in')),
  result text check (result in ('won', 'lost', 'split', 'folded')),
  result_amount numeric,
  revealed_hole_cards jsonb,
  joined_at timestamptz not null default now()
);
create unique index poker_table_seats_seat_idx on poker_table_seats (table_id, seat_index);
create unique index poker_table_seats_user_idx on poker_table_seats (table_id, user_id);
create index poker_table_seats_table_id_idx on poker_table_seats (table_id);

create table poker_hole_cards (
  seat_id uuid primary key references poker_table_seats(id) on delete cascade,
  cards jsonb not null
);

alter publication supabase_realtime add table poker_table, poker_table_seats;

alter table poker_table enable row level security;
alter table poker_table_seats enable row level security;
alter table poker_hole_cards enable row level security;

create policy "anon select" on poker_table for select using (true);
create policy "anon insert" on poker_table for insert with check (true);
create policy "anon update" on poker_table for update using (true) with check (true);

create policy "anon select" on poker_table_seats for select using (true);
create policy "anon insert" on poker_table_seats for insert with check (true);
create policy "anon update" on poker_table_seats for update using (true) with check (true);
create policy "anon delete" on poker_table_seats for delete using (true);

-- Deliberately no select policy — see header. Insert/delete let the
-- dealing client seed and clear cards each hand; reads only happen through
-- the two functions below.
create policy "anon insert" on poker_hole_cards for insert with check (true);
create policy "anon delete" on poker_hole_cards for delete using (true);

create or replace function get_my_hole_cards(p_seat_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cards jsonb;
begin
  if not exists (select 1 from poker_table_seats where id = p_seat_id and user_id = p_user_id) then
    return null;
  end if;
  select cards into v_cards from poker_hole_cards where seat_id = p_seat_id;
  return v_cards;
end;
$$;
grant execute on function get_my_hole_cards(uuid, uuid) to anon, authenticated;

create or replace function reveal_showdown_hole_cards(p_table_id uuid)
returns table(seat_id uuid, cards jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from poker_table where id = p_table_id and status in ('showdown', 'hand_over')) then
    raise exception 'Not at showdown yet';
  end if;
  return query
    select phc.seat_id, phc.cards
    from poker_hole_cards phc
    join poker_table_seats pts on pts.id = phc.seat_id
    where pts.table_id = p_table_id and pts.status in ('active', 'all_in');
end;
$$;
grant execute on function reveal_showdown_hole_cards(uuid) to anon, authenticated;

-- New transaction type, same pattern as prior game additions.
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
    'loan', 'repayment', 'adjustment', 'slots', 'blackjack', 'checkin', 'poker'
  ));
