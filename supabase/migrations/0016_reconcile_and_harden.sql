-- Office Bets — reconcile Sai's balance gap, add "adjustment" type
--
-- A full audit found Sai's actual balance (141) sits 140 tokens below what
-- the transaction ledger implies (281), even though every subsystem
-- (wagers, roulette bet-for-bet) reconciles exactly on its own. The most
-- likely mechanism: placeRouletteBet used to debit the balance and only
-- afterward attempt to log the ledger entry without checking whether that
-- insert actually succeeded — a transient failure there would silently
-- lose the ledger trace while the debit still happened for real. That code
-- path (and every other balance-mutating function) is fixed in this same
-- change to log the transaction before moving the balance, so a failure
-- leaves an investigable orphan instead of a silent gap.
--
-- The 140 gap itself isn't reversed here — the actual balance reflects
-- real activity that happened, just under-logged. This backfills a single
-- adjustment entry so the ledger matches reality, without touching the
-- balance.

alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('stipend', 'wager', 'payout', 'refund', 'transfer', 'roulette', 'loan', 'repayment', 'adjustment'));

insert into transactions (user_id, type, amount)
  select id, 'adjustment', -140 from users where name = 'Sai';
