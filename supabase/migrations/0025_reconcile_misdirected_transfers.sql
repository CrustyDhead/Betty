-- Office Bets — redirect two misdirected transfers to the right "Sai"
--
-- Game sent two transfers (100, then 200 tokens) intending them for the
-- "Sai" account, but picked the wrong entry from a similarly-named list —
-- both landed on a different, separate account named "sai🐵🙈🙉🙊" instead.
-- Both transfers were correctly recorded on both sides (nothing was lost or
-- duplicated) — this migration just moves the 300 tokens to the intended
-- account and logs it as an adjustment on each side, same pattern as
-- 0016_reconcile_and_harden.sql and 0021_reconcile_sai_race.sql, so it's
-- traceable in each account's statement rather than a silent balance edit.

do $$
declare
  v_sai_id uuid;
  v_misdirected_id uuid;
  v_amount numeric := 300;
begin
  select id into v_sai_id from users where name = 'Sai';
  select id into v_misdirected_id from users where name = 'sai🐵🙈🙉🙊';

  if v_sai_id is null or v_misdirected_id is null then
    raise exception 'Could not find both accounts by name — check for renames before re-running';
  end if;

  update users set token_balance = token_balance - v_amount where id = v_misdirected_id;
  update users set token_balance = token_balance + v_amount where id = v_sai_id;

  insert into transactions (user_id, type, amount)
  values (v_misdirected_id, 'adjustment', -v_amount);
  insert into transactions (user_id, type, amount)
  values (v_sai_id, 'adjustment', v_amount);
end $$;
