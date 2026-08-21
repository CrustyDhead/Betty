-- Office Bets — free-text bet subject
-- Lets a bet be "about" someone who isn't a registered app user yet
-- (e.g. "can Ploy finish 2 water bottles" before Ploy has ever logged in).
-- Mutually exclusive with subject_user_id at the app layer — not enforced
-- as a DB constraint since that's more friction than this needs.

alter table bets add column subject_name text;
