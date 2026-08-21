-- Office Bets — emoji profile pictures
-- Nullable: falls back to the name-initial avatar when unset.

alter table users add column avatar_emoji text;
