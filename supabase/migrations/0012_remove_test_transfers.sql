-- Office Bets — remove test transfer-token activity
--
-- All 8 "transfer" transactions in the ledger came from testing (either UAT
-- passes or this session's live verification of the transfer feature), not
-- real usage. Deleting the transaction rows alone would leave balances
-- inflated with no ledger entry to explain them — the same class of bug the
-- duplicate-payout audit fixed — so Sai's balance is corrected first.
--
-- Net effect per user from the 8 rows: Jade 0, sxn 0, Sai +125 (100 + 25).
-- Jade's and sxn's transfers were round-trip test sends that net to zero,
-- so no balance change is needed for them — only Sai actually ended up
-- with tokens that have no other explanation.

update users set token_balance = token_balance - 125
  where id = '7c64972a-b7eb-4430-a8f3-a1e4fb6be1ca'; -- Sai

delete from transactions where type = 'transfer';
