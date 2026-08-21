# Office Bets — App Design Spec

*A no-money prediction market for your team's daily chaos: WFH calls, sick days, late arrivals, and whatever else people want to bet on.*

(Placeholder name — swap for whatever's funnier: "WFH or Nah", "The Ledger", "DeskDoom", "Odds Are")

---

## 1. Core Concept

- Someone opens a **bet** on an event ("Will Nat WFH before 10am?", "Ploy calls in sick today?").
- Teammates wager play-money **tokens** on Yes or No.
- When the outcome is known, whoever knows the truth **resolves** the bet (honor system).
- The winning side splits the entire pot, proportional to how much each person staked.

No real money anywhere — this is purely a fun leaderboard/bragging-rights game.

---

## 2. Token Economy

| Item | Suggested default | Notes |
|---|---|---|
| Starting balance | 1,000 tokens | Round number, easy to reason about |
| Weekly stipend | +100 tokens every Monday | Keeps the game alive even after a bad week; prevents permanent zero-balance players |
| Min/max wager | 10 / no cap (or cap at balance) | Adjust once you see how people actually play |
| Going negative | Not allowed | Can't stake more tokens than you currently have |

*(These are just sensible starting points — easy to tune later.)*

---

## 3. Betting Mechanics (Yes/No Pot Split)

1. Bet opens, accepting Yes/No wagers until a **lock time** the creator sets.
2. At lock time, no more wagers accepted.
3. Bet gets **resolved** (Yes or No) once the real outcome is known.
4. The pool from the *losing* side is redistributed to the *winning* side, proportional to stake:

```
payout(you) = your_stake + (your_stake / total_winning_stake) × total_losing_stake
```

**Example:**
- YES pool: Sai 100, Jade 200 → total 300
- NO pool: Pete 300 → total 300
- Total pot: 600
- Outcome = YES. Losing pool (300) is split proportionally among YES bettors:
  - Sai gets back 100 + (100/300 × 300) = 200
  - Jade gets back 200 + (200/300 × 300) = 400

Straightforward, feels fair, and rewards early/confident bets without needing real odds math.

---

## 4. Bet Lifecycle

```
OPEN  →  LOCKED  →  RESOLVED
                 ↘  VOID (edge cases below)
```

- **OPEN** — accepting wagers
- **LOCKED** — past lock time, waiting on real-world outcome
- **RESOLVED** — someone marks Yes/No, payouts calculated and applied
- **VOID** — edge case fallback (see below), stakes returned to everyone

**Edge cases to decide on later:**
- Everyone bet the same side (no opposing pool) → auto-void, return stakes
- Nobody resolves it within some window → auto-void after N hours
- Someone disputes the resolution → simplest MVP answer is "trust the resolver"; a lightweight flag/re-vote system can be a Phase 2 feature if honor system breaks down in practice

---

## 5. Screens

| Screen | Purpose |
|---|---|
| **Feed** | List of open bets — title, subject, current Yes/No split, time left, your position if any |
| **Bet Detail** | Full description, live Yes/No pool bar, wager form, who's bet what |
| **Create Bet** | Title, description, optional "subject" person, lock time |
| **My Bets** | Your active wagers + history + running P/L |
| **Leaderboard** | Ranked by token balance, plus win rate / streaks |
| **Profile** | Stats, balance, badges (phase 2) |

---

## 6. Data Model

**User**
- id, name, avatar, token_balance

**Bet**
- id, title, description, subject_user_id (optional — who the bet is about), creator_id, lock_time, status (open/locked/resolved/void), outcome (yes/no/null)

**Wager**
- id, bet_id, user_id, side (yes/no), amount, payout (null until resolved)

**Transaction** *(for history/audit)*
- id, user_id, type (stipend / wager / payout / refund), amount, timestamp

---

## 7. Suggested Tech Stack

Since it's a small friend-group tool that needs live-ish updates (seeing odds shift as people bet) but zero real security stakes:

- **Frontend:** React + Vite + Tailwind
- **Backend/DB:** Supabase (Postgres + realtime subscriptions + built-in auth) — good fit given you've already got Supabase reps from your other vibe-coding projects
- **Auth:** Lightest possible — pick your name from a fixed roster + a shared team PIN, rather than full email/password auth. No real security needed here.
- **Hosting:** Vercel or Netlify for the frontend; Supabase handles the backend

This keeps it buildable in a single focused session with Claude Code, with realtime pool updates basically free via Supabase subscriptions.

---

## 8. UI & Visual Direction — "modern, simple, cool"

Rather than leaving that vague, here's a concrete direction. The whole app is built around one binary choice (Yes/No), so the identity leans into that instead of generic dashboard styling.

**Signature element:** every bet card shows a live horizontal split bar — green portion vs. coral portion, weighted by tokens staked — that visibly shifts as people place wagers. It's both the core data viz and the thing that makes the app recognizably *itself*. The same two-color logic echoes everywhere: buttons, leaderboard win/loss, the create-bet form.

**Color**
| Role | Value |
|---|---|
| Background | `#F7F8FA` — cool off-white, not warm cream |
| Surface (cards) | `#FFFFFF` with a soft shadow, 14–16px radius |
| Ink / primary text | `#12141C` |
| Secondary text | `#6B7280` |
| YES accent | `#16B278` (vivid teal-green) |
| NO accent | `#FF5D5D` (punchy coral) |

**Type**
- Display / headings: **Space Grotesk** — geometric, a little playful, avoids the generic serif/Inter defaults
- Body: **Inter** or system-ui — stays out of the way
- Numbers/odds/countdowns: **JetBrains Mono** — token counts, percentages, and lock-time countdowns get a ticker/scoreboard feel, which suits a "market" on your coworkers' habits

**Layout**
- Feed = vertical stack of bet cards. Each card: title, subject's avatar, the live split bar, pot total (mono), countdown chip, your position if you're in
- Generous whitespace, soft shadows, 14–16px rounded corners throughout — friendly, not corporate, not a harsh broadsheet grid

**Motion** — kept deliberately minimal: the split bar eases smoothly when a new wager lands, countdown chips tick, cards lift slightly on hover. Nothing more — this isn't a marketing site, it should feel snappy and quiet.

---

## 9. MVP vs Phase 2

**MVP (build first)**
- Fixed roster of teammates, simple name+PIN login
- Create bet, place wager, lock, resolve, pot-split payout
- Feed + Bet Detail + My Bets + Leaderboard

**Phase 2 (fun additions once MVP works)**
- Badges/streaks ("Correctly called 5 sick days in a row")
- Comments/banter thread on each bet
- Bet categories (WFH / Sick / Late / Custom) with filters
- Push/desktop notifications when a bet you're in resolves
- Dispute flag → group re-vote
- Auto-posting bet results back into your actual group chat

---

## 10. Open Questions Before Building

- Who's in the roster — fixed list you type in, or open self-signup?
- Confirm starting balance / weekly stipend numbers (or change them)
- Min/max wager size
- Should the bet **subject** (the person being bet on) be blocked from betting on their own bet? (Recommend: yes, avoids obvious conflict of interest)

---

## 11. Claude Code Kickoff Prompt

Paste this (plus this whole spec file, if you drop it in the repo) into Claude Code to start scaffolding:

```
Build "Office Bets" — a fun, no-real-money prediction market web app for a small
friend group at work. Full design spec is in office-bets-app-design-spec.md — read it
first and follow it closely.

Quick summary:
- Stack: React + Vite + Tailwind frontend, Supabase for Postgres + realtime + auth
- Auth: pick your name from a fixed roster + shared team PIN, nothing heavier
- Core loop: create a Yes/No bet with a lock time → people wager tokens on Yes/No →
  after lock time, someone resolves it → losing pool splits proportionally to the
  winning side's stakes (exact formula is in the spec, section 3)
- MVP screens: Feed, Bet Detail, Create Bet, My Bets, Leaderboard
- UI direction: modern, simple, "cool" — off-white background (#F7F8FA), teal (#16B278)
  for YES and coral (#FF5D5D) for NO used consistently throughout, Space Grotesk for
  headings, Inter for body, JetBrains Mono for token counts/odds/countdowns. Signature
  element is a live horizontal split bar on every bet card showing the current Yes/No
  token split, animating as new wagers land.

Start by scaffolding the project structure and Supabase schema (User, Bet, Wager,
Transaction tables per the spec), then build the Feed and Bet Detail screens first
since they're the core of the experience.
```
