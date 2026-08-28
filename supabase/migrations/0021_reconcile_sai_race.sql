-- Office Bets — reconcile Sai's balance from the lost-update race
--
-- Found and root-caused live during a full casino-games test pass: two
-- roulette bets placed 1ms apart both logged their -50 debit correctly,
-- but the second balance write raced the first on a stale client-side
-- read and clobbered it instead of compounding — the real balance only
-- reflects one of the two debits (+50 gap). A follow-up test spin, run
-- deliberately to confirm the app fails cleanly before this migration
-- (0020) was applied, added another +10: its transaction and spin row
-- both landed, but the balance move correctly errored since
-- adjust_balance() didn't exist yet — exactly the "investigable orphan,
-- not a silent loss" behavior that reordering was designed to produce.
--
-- Both are backfilled here as one adjustment so the statement matches
-- reality; the real balance already reflects what actually happened, so
-- it isn't touched.

insert into transactions (user_id, type, amount)
  select id, 'adjustment', 60 from users where name = 'Sai';
