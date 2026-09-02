-- Office Bets — remove disposable poker test accounts
--
-- PokerTestBot1/2/3 were created during end-to-end testing of the Poker
-- feature (via the normal signup-code flow, not real teammates) and are no
-- longer needed. Deleting the users cascades to their poker seats, hole
-- cards, and transactions via the existing "on delete cascade" foreign
-- keys — same pattern as every other user-owned table in this app.
--
-- Not touching poker_table itself: if one of these bots happens to be
-- mid-hand when this runs, the engine already self-heals a seat that
-- vanishes out from under it — nudgePokerTableIfStale notices the current
-- seat no longer exists and advances the hand (or awards the pot to
-- whoever's left) the next time any client has the Poker page open. No
-- manual reset needed, and it avoids clearing a real player's seat as a
-- side effect.

delete from users where name in ('PokerTestBot1', 'PokerTestBot2', 'PokerTestBot3');
