# MizuHeng888

A no-money prediction market for your team's daily chaos. Full design spec: [office-bets-app-design-spec.md](./office-bets-app-design-spec.md) (the original planning doc — still references the "Office Bets" working title).

## Status

Live and running against a real Supabase backend (Postgres + polling-based live sync, see below). Deployed on Vercel.

Built: Feed, Bet Detail, Create Bet (with quick-start templates), My Bets, Leaderboard, Profile · bet categories (WFH/Sick/Late/Dare/Custom) with feed filters · free-text bet subjects (tag someone who hasn't signed up yet) · comments/banter thread per bet · win-streak badges · dispute flag → re-resolve · creator-only delete (pre-settlement, auto-refunds) · early resolve (before the lock timer runs out) · emoji + color avatar customization · browser notifications when your bets resolve · shareable bet links.

Not built (needs external infra/credentials beyond what's set up here): auto-posting results to a group chat.

## Getting started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see below) to run against the real backend — without them the app fails to load rather than falling back to mock data.

Log in with any name (open self-signup) — new names start with 1,000 tokens.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql`, then every file in `supabase/migrations/` **in order** (0002 through the latest) in the SQL editor.
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from Project Settings → API.

Set `VITE_TEAM_PIN` in `.env` to require a shared PIN at login; leave it blank to skip that step.

`supabase/reset-for-launch.sql` is a one-time manual script (not a numbered migration) that wipes all data — use it to clear test accounts before a real launch, not as part of normal setup.

## Live sync

Supabase Realtime (`postgres_changes`) never delivered events in testing, for reasons that looked server-side and weren't debuggable from the client (channel connects and reports `SUBSCRIBED`, publication membership is correct, tried both API key formats). The app polls every 15s and refetches on tab focus instead — updates land within that window, not instantly. The realtime subscription is left wired up in `src/lib/store.ts` in case it starts working; nothing depends on it.

## Stack

React + Vite + TypeScript + Tailwind CSS v4, React Router, Supabase (Postgres + RLS), deployed on Vercel.

## Decisions baked into this app

- Roster is **open self-signup** — anyone can pick a name, no fixed list.
- **Self-betting is allowed** — no lockout on betting on your own subject bet.
- Token economy: 1,000 starting balance, variable weekly stipend (~100 typical, occasional boosted/jackpot roll), 10 min wager, no max.
- Auth is a shared PIN checked client-side, not real per-user identity — by design, per the original spec's "lightest possible auth" call. RLS is tightened to remove unused DELETE/UPDATE grants, but the anon key can still read everything and forge writes as any user. Acceptable for a trusted friend-group tool; revisit if that stops being true.
