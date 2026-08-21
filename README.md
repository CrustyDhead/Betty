# Office Bets

A no-money prediction market for your team's daily chaos. Full design spec: [office-bets-app-design-spec.md](./office-bets-app-design-spec.md).

## Status

MVP screens plus most of Phase 2 are built and running against a **localStorage-backed data layer** (`src/lib/store.ts`) — no Supabase project required to try it out. The store's function signatures (`createBet`, `placeWager`, `resolveBet`, ...) are shaped like the eventual Supabase queries, so wiring up a real backend later is a matter of swapping implementations, not redesigning callers.

Built: Feed, Bet Detail, Create Bet, My Bets, Leaderboard, Profile · bet categories (WFH/Sick/Late/Custom) with feed filters · comments/banter thread per bet · win-streak badges · dispute flag → re-resolve (reverses the old payout, re-applies a new outcome).

Not built (needs external infra/credentials, out of scope for a local scaffold): push/desktop notifications, auto-posting results to a group chat.

## Getting started

```bash
npm install
npm run dev
```

Log in with any name (open self-signup) — new names start with 1,000 tokens. Seed data includes a few sample users and bets so the Feed isn't empty on first run.

## Moving to a real Supabase backend

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. Swap the functions in `src/lib/store.ts` over to real queries via the client in `src/lib/supabase.ts`, one at a time.

Set `VITE_TEAM_PIN` in `.env` to require a shared PIN at login; leave it blank to skip that step.

## Stack

React + Vite + TypeScript + Tailwind CSS v4, React Router, Supabase (Postgres + realtime, not yet wired up).

## Decisions baked into this scaffold

- Roster is **open self-signup** — anyone can pick a name, no fixed list.
- **Self-betting is allowed** — no lockout on betting on your own subject bet.
- Token economy uses the spec's defaults: 1,000 starting balance, +100/week stipend, 10 min wager, no max.
