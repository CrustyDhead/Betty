-- Office Bets — peer-to-peer token transfers
-- Adds "transfer" to the allowed transactions.type values, same pattern
-- as 0003_dare_category.sql for the category check constraint.

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
  add constraint transactions_type_check check (type in ('stipend', 'wager', 'payout', 'refund', 'transfer'));
