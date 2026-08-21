-- Office Bets — customizable avatar background color
-- Nullable: falls back to the default slate background when unset.

alter table users add column avatar_color text;
