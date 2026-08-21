-- Office Bets — add "Dare" category (e.g. "can Ploy finish 2 water bottles?")
-- Drops whatever the category check constraint got auto-named (varies by
-- how it was created) and re-adds it with a fixed name and the new value.

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.bets'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table bets drop constraint %I', con.conname);
  end loop;
end $$;

alter table bets
  add constraint bets_category_check check (category in ('WFH', 'Sick', 'Late', 'Dare', 'Custom'));
