-- Office Bets — remove the "JB" and "Jade" test accounts
--
-- Neither has ever placed a wager, created a bet, or posted a comment, so
-- removing them has zero effect on any other bet's pool totals or anyone
-- else's history. wagers/transactions/comments all cascade on user delete.

delete from users where id in (
  '21d03d3d-d1af-465b-85ce-6cad852d85d5', -- JB
  '6ec6585b-1969-4496-a616-4b25c679ce19'  -- Jade
);
