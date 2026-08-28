-- Office Bets — atomic balance adjustments
--
-- Found via a full casino-games test pass: two rapid bets (two chip clicks
-- within 1ms of each other) each read token_balance client-side and wrote
-- back an absolute new value. Both reads happened before either write's
-- result came back, so both computed the same "starting balance minus
-- stake" — the second write silently clobbered the first instead of
-- compounding it. The ledger correctly logged both debits; the real
-- balance only reflected one. Reordering writes (an earlier fix) protects
-- against a failed insert leaving no trace — it does nothing for this,
-- since both writes succeeded, they just raced on a stale read.
--
-- This function makes the adjustment atomic at the database level
-- (`token_balance = token_balance + delta` evaluated by Postgres, not
-- computed by the client from a snapshot), which closes the race
-- regardless of how close together two calls land.
-- Also guards against going negative — no legitimate operation ever
-- intends that, and without this, two individually-valid deductions
-- racing each other could combine to overdraw even though each one's own
-- client-side balance check passed.
create or replace function adjust_balance(p_user_id uuid, p_delta numeric)
returns setof users
language plpgsql
as $$
begin
  if exists (
    select 1 from users where id = p_user_id and token_balance + p_delta < 0
  ) then
    raise exception 'Insufficient balance';
  end if;

  return query
    update users set token_balance = token_balance + p_delta where id = p_user_id returning *;
end;
$$;

grant execute on function adjust_balance(uuid, numeric) to anon;
grant execute on function adjust_balance(uuid, numeric) to authenticated;
