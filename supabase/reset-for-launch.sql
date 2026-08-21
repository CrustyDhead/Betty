-- Office Bets — wipe all test/dev data before going live
--
-- NOT a numbered migration — this is a one-time manual reset, not part of
-- the schema history. Run it once, right before handing the app to the
-- real team.
--
-- Deletes every row in every table: all test users (Sai, Jade, Pete,
-- Mint, ...), every bet, wager, comment, and transaction created while
-- building/testing this. Schema, RLS policies, and realtime publication
-- are untouched — only data goes.
--
-- IDs are UUIDs (gen_random_uuid()), not sequences, so there's nothing to
-- reset identity-wise. CASCADE handles delete order automatically.

truncate table comments, transactions, wagers, bets, users cascade;
