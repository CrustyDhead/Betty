-- Office Bets — server-side auth: hashed team PIN + admin-issued signup codes
--
-- Two real holes existed before this migration:
--   1. The team PIN was only checked in the browser (VITE_TEAM_PIN), shipped
--      in cleartext in the JS bundle, and login() itself never checked it —
--      anyone could open devtools and call login('Sai') (or any name) with
--      no PIN at all, either logging in as an existing person or freely
--      minting a brand-new account.
--   2. users had an unconditional "anon insert" policy, so even fixing #1
--      client-side wouldn't have helped — a direct REST/devtools insert
--      into users bypassed the UI entirely.
--
-- This migration moves both checks into the database:
--   * The PIN is now stored hashed (bcrypt via pgcrypto) and compared
--     inside a SECURITY DEFINER function, never sent to the browser.
--   * users no longer allows direct anon inserts — the only way to create
--     an account is redeem_signup_code(), which requires a one-time code
--     an admin relayed out of band.
--   * New names go through request_signup_code() -> an admin sees the
--     pending code in an in-app admin panel (and gets the same browser
--     notification already used for bet resolutions) -> relays it manually
--     -> the new person redeems it.
--
-- Same trust model as the rest of the app otherwise (see schema.sql): this
-- is a friend-group app with no per-request auth, so a sufficiently
-- determined person with devtools open and the anon key could still read
-- signup_codes directly (its SELECT policy stays permissive, same as every
-- other table) — the real protection is that a casual person has no reason
-- to go digging for it, and can no longer just skip the gate entirely by
-- calling the exported login function. Existing users are unaffected:
-- name + the same shared PIN still logs them in, just verified server-side
-- now instead of trusted from the client.

alter table users add column is_admin boolean not null default false;

-- Adjust the name below if a different account should be the admin.
update users set is_admin = true where lower(name) = lower('Sai');

create table app_config (
  id int primary key default 1 check (id = 1),
  team_pin_hash text not null
);
insert into app_config (id, team_pin_hash) values (1, crypt('2790', gen_salt('bf')));
-- No RLS policies at all on app_config — anon has zero direct access
-- (select/insert/update all default-deny). Only SECURITY DEFINER functions
-- below, which run as the table owner, can read the hash.
alter table app_config enable row level security;

create table signup_codes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'used', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index signup_codes_status_idx on signup_codes (status);
create index signup_codes_name_idx on signup_codes (lower(name));

alter table signup_codes enable row level security;
-- select stays permissive, matching every other table in this app (the
-- admin panel needs to poll it) — but there are deliberately no anon
-- insert/update/delete policies, so a code can only be created or redeemed
-- through the functions below, never fabricated or force-redeemed directly.
create policy "anon select" on signup_codes for select using (true);

-- users no longer allows direct signup inserts — only redeem_signup_code()
-- (SECURITY DEFINER, below) can create a row now.
drop policy if exists "anon insert" on users;

-- ---- Existing-user login ----
-- Verifies name + the shared team PIN server-side. Returns the matching
-- user row on success; an empty result means "no account with that name"
-- (client treats that as "go sign up instead"); a wrong PIN raises.
create or replace function verify_existing_login(p_name text, p_pin text)
returns setof users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select team_pin_hash into v_hash from app_config where id = 1;
  if v_hash is null or crypt(p_pin, v_hash) <> v_hash then
    raise exception 'Wrong team PIN';
  end if;

  return query select * from users where lower(name) = lower(trim(p_name));
end;
$$;
grant execute on function verify_existing_login(text, text) to anon, authenticated;

-- ---- New-user signup request ----
-- Generates a one-time 6-digit code for a not-yet-registered name. The
-- code is deliberately never returned here — it's only ever surfaced in
-- the admin panel (signup_codes' permissive select), so the requester's
-- own RPC call can't just read it back and skip the admin.
create or replace function request_signup_code(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
  v_code text;
begin
  if v_name = '' then
    raise exception 'Enter a name';
  end if;
  if exists (select 1 from users where lower(name) = lower(v_name)) then
    raise exception 'That name is already registered — log in instead';
  end if;

  update signup_codes
    set status = 'expired'
    where lower(name) = lower(v_name) and status = 'pending' and expires_at <= now();

  if exists (select 1 from signup_codes where lower(name) = lower(v_name) and status = 'pending') then
    raise exception 'A code was already requested for that name — ask your admin for it';
  end if;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  insert into signup_codes (name, code, expires_at) values (v_name, v_code, now() + interval '30 minutes');
end;
$$;
grant execute on function request_signup_code(text) to anon, authenticated;

-- ---- Signup code redemption ----
-- Creates the account once the newcomer enters the code an admin relayed
-- to them out of band. 1000 starting balance matches STARTING_BALANCE in
-- src/lib/store.ts.
create or replace function redeem_signup_code(p_name text, p_code text)
returns setof users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
  v_row signup_codes%rowtype;
begin
  select * into v_row from signup_codes
    where lower(name) = lower(v_name) and status = 'pending'
    order by created_at desc
    limit 1;

  if v_row.id is null then
    raise exception 'No pending code for that name — request one first';
  end if;
  if v_row.expires_at < now() then
    update signup_codes set status = 'expired' where id = v_row.id;
    raise exception 'That code expired — request a new one';
  end if;
  if v_row.code <> trim(p_code) then
    raise exception 'Wrong code';
  end if;

  update signup_codes set status = 'used', used_at = now() where id = v_row.id;

  return query insert into users (name, token_balance) values (v_name, 1000) returning *;
end;
$$;
grant execute on function redeem_signup_code(text, text) to anon, authenticated;
