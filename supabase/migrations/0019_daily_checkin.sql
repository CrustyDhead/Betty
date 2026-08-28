-- Office Bets — daily check-in replaces the weekly stipend
--
-- Weekly auto-stipend is retired in favor of an explicit daily action —
-- the whole point of a check-in mechanic is rewarding the act of coming
-- back, not a passive grant. last_stipend_at is left in place (existing
-- rows still reference it, and old stipend transactions keep their type
-- for history) but the app stops writing to it going forward.

alter table users add column last_checkin_at timestamptz;
alter table users add column checkin_streak int not null default 0;

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
    'loan', 'repayment', 'adjustment', 'slots', 'blackjack', 'checkin'
  ));
