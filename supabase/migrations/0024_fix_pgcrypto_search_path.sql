-- Office Bets — fix verify_existing_login's "function crypt(text, text)
-- does not exist" error
--
-- Supabase pre-installs pgcrypto into the `extensions` schema (not
-- `public`), so schema.sql's `create extension if not exists "pgcrypto"`
-- was a no-op there. verify_existing_login locked its search_path down to
-- just `public` (good practice against search_path hijacking on a
-- SECURITY DEFINER function) but that also hid crypt(), which only exists
-- in `extensions`. Widening the search_path to include it fixes login
-- without loosening anything meaningful — extensions is Supabase-managed,
-- not something an anon caller can write into.

alter function verify_existing_login(text, text) set search_path = public, extensions;
