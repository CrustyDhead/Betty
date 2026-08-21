-- Office Bets — tighten RLS from "anon full access" to per-operation grants
--
-- The original "for all using (true)" policies meant anyone with the
-- public anon key (visible in the client bundle to anyone who opens
-- devtools) could DELETE every row in every table — wiping the whole
-- app's data — regardless of what the UI actually exposes. That was an
-- acceptable shortcut while this was just being built and tested; it's a
-- real risk now that real people are using the live app.
--
-- This does NOT add real per-user authorization — there's still no
-- server-verified identity (auth is a shared PIN checked client-side, by
-- design, per the spec's "lightest possible auth" call). Anyone with the
-- key can still read everything and forge writes as any user. What this
-- fixes specifically: removes every DELETE/UPDATE grant the app's own
-- code never uses, auditted directly against every `.from(...)` call in
-- src/lib/store.ts. Only `bets` needs DELETE (the Delete-bet feature);
-- nothing needs it on users/wagers/transactions/comments, and nothing
-- ever UPDATEs transactions or comments (both are insert-only logs).

drop policy if exists "anon full access" on users;
create policy "anon select" on users for select using (true);
create policy "anon insert" on users for insert with check (true);
create policy "anon update" on users for update using (true) with check (true);

drop policy if exists "anon full access" on bets;
create policy "anon select" on bets for select using (true);
create policy "anon insert" on bets for insert with check (true);
create policy "anon update" on bets for update using (true) with check (true);
create policy "anon delete" on bets for delete using (true);

drop policy if exists "anon full access" on wagers;
create policy "anon select" on wagers for select using (true);
create policy "anon insert" on wagers for insert with check (true);
create policy "anon update" on wagers for update using (true) with check (true);

drop policy if exists "anon full access" on transactions;
create policy "anon select" on transactions for select using (true);
create policy "anon insert" on transactions for insert with check (true);

drop policy if exists "anon full access" on comments;
create policy "anon select" on comments for select using (true);
create policy "anon insert" on comments for insert with check (true);
