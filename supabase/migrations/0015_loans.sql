-- Office Bets — house-issued token loans with interest
--
-- House-issued only (no peer-to-peer lending — avoids real interpersonal
-- debt/collection drama over fake tokens). One active loan per user at a
-- time, enforced by the partial unique index below. Interest is flat, not
-- compounding: borrow 200 at 10% -> owe 220, due in 7 days. Balances must
-- never go negative — if a due-date auto-collection can't cover the full
-- amount owed, it takes what's available and the loan flips to 'overdue'
-- with the remainder tracked in amount_owed, rather than overdrawing the
-- user's token_balance.

create table loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  principal numeric not null check (principal > 0),
  interest_rate numeric not null,
  amount_owed numeric not null check (amount_owed >= 0),
  status text not null default 'active' check (status in ('active', 'overdue', 'repaid')),
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null,
  repaid_at timestamptz
);

create unique index loans_one_active_per_user on loans (user_id) where status in ('active', 'overdue');
create index loans_user_id_idx on loans (user_id);

alter publication supabase_realtime add table loans;

alter table loans enable row level security;
create policy "anon select" on loans for select using (true);
create policy "anon insert" on loans for insert with check (true);
create policy "anon update" on loans for update using (true) with check (true);

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
  check (type in ('stipend', 'wager', 'payout', 'refund', 'transfer', 'roulette', 'loan', 'repayment'));
