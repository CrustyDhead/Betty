-- Office Bets — richer transaction context for a "token statement" view
--
-- bet_id: which bet a wager/payout/refund relates to, so a statement can
-- show "Wager: -50 · Will Nat WFH today?" instead of a bare amount. Null
-- for stipend/transfer, which aren't tied to a specific bet.
--
-- counterparty_user_id: for transfers, who the other party was — a
-- transfer row without this would just read "-25 Transfer" with no way
-- to tell who it went to. Null for every other transaction type.

alter table transactions add column bet_id uuid references bets(id) on delete set null;
alter table transactions add column counterparty_user_id uuid references users(id) on delete set null;
