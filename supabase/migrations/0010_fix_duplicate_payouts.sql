-- Office Bets — one-time data fix for the duplicate-payout bug found by audit
--
-- resolveBet had no guard against being invoked twice for the same bet, and
-- the Resolve buttons had no submit-disable, so a double-click raced past
-- the stale-state check and paid 4 winners 3x instead of once on "Will P
-- Ploy finish Purra water within today?". Fixed in the app code (see
-- migration-adjacent commit) with an atomic status claim; this migration
-- corrects the balances and ledger left over from before that fix.
--
-- Also backfills one real transfer (Jade -> Sai, 100 tokens) that moved
-- money correctly but was never logged, because transferTokens used to
-- silently swallow errors on its final ledger insert — that insert failed
-- before migration 0009 added counterparty_user_id, so the money moved with
-- no transaction row on either side. Also fixed in app code.

-- 1. Deduct the 2 extra payout applications from each overpaid winner.
update users set token_balance = token_balance - 2 * 1690.909090909091
  where id = '18228f55-7f87-4d40-bd32-93e16efc8dff'; -- Ploy
update users set token_balance = token_balance - 2 * 439.6363636363636
  where id = '60fe0723-5de5-4897-8fed-7c5e1c1d8ae2'; -- Mookpra
update users set token_balance = token_balance - 2 * 25.363636363636367
  where id = 'b759fcb7-87bb-428b-b045-7361dcadc51a'; -- Jade
update users set token_balance = token_balance - 2 * 169.0909090909091
  where id = '1170c603-e71a-4000-b50e-f5951b6ab5ae'; -- sai🐵🙈🙉🙊

-- 2. Remove the 2 duplicate payout transaction rows per user, keeping the
--    earliest (first) one so the Statement shows exactly one payout entry.
delete from transactions where id in (
  'e88992d4-8628-4256-b530-716f8ec24ab0', '58872b9e-c503-4b8c-9c4d-ab20b44c9772', -- Ploy
  '79e8f430-65a4-419e-8a4f-d1cf76854a7b', '4168c82a-e27a-4a7c-8882-f8c1f56ab34c', -- Mookpra
  '357e154f-3ef3-4101-a9c5-c9158a2fd598', '31637113-4ea7-46dd-bd87-a6bd428c8886', -- Jade
  '5f8ca60b-d2cc-4a7f-9065-f52c99779700', '6f5634e7-1e57-4de0-b8b0-3fd799d37272'  -- sai🐵🙈🙉🙊
);

-- 3. Backfill the missing Jade -> Sai 100-token transfer record (both sides
--    of the ledger). Balances already reflect this transfer correctly —
--    this only restores the missing Statement entries.
insert into transactions (user_id, type, amount, counterparty_user_id, timestamp) values
  ('b759fcb7-87bb-428b-b045-7361dcadc51a', 'transfer', -100, '7c64972a-b7eb-4430-a8f3-a1e4fb6be1ca', '2026-08-21T08:45:00+00:00'),
  ('7c64972a-b7eb-4430-a8f3-a1e4fb6be1ca', 'transfer', 100, 'b759fcb7-87bb-428b-b045-7361dcadc51a', '2026-08-21T08:45:00+00:00');

-- 4. Remove the "ResetCheck" test account — a throwaway used to verify the
--    DB-reset flow: one stipend transaction, no wagers, no comments, ever.
--    wagers/transactions/comments all cascade on user delete, so this is
--    the only statement needed.
delete from users where id = 'eae21f35-7cfd-44ad-82c1-fca2ebb81045';
