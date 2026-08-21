import type { Bet, BetCategory, BetStatus, Comment, Side, Transaction, User, Wager } from "../types";

/**
 * Local, browser-only data layer standing in for Supabase until a real
 * project is wired up (see supabase/migrations + src/lib/supabase.ts).
 * Function signatures are shaped like the eventual Supabase queries so
 * swapping the implementation later shouldn't touch calling code.
 */

const STORAGE_KEY = "office-bets/state/v1";
const CURRENT_USER_KEY = "office-bets/current-user";

export const STARTING_BALANCE = 1000;
export const WEEKLY_STIPEND = 100;
export const MIN_WAGER = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface State {
  users: User[];
  bets: Bet[];
  wagers: Wager[];
  transactions: Transaction[];
  comments: Comment[];
  stipendLog: Record<string, string>; // userId -> ISO timestamp of last stipend
}

function seedState(): State {
  const now = Date.now();
  const users: User[] = [
    { id: "u-sai", name: "Sai", tokenBalance: 1240 },
    { id: "u-jade", name: "Jade", tokenBalance: 860 },
    { id: "u-pete", name: "Pete", tokenBalance: 1500 },
    { id: "u-nat", name: "Nat", tokenBalance: 970 },
  ];

  const bets: Bet[] = [
    {
      id: "b-1",
      title: "Will Nat WFH before 10am?",
      description: "Nat mentioned traffic on the group chat last night. Slack status is the tell.",
      subjectUserId: "u-nat",
      creatorId: "u-sai",
      lockTime: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
      status: "open",
      outcome: null,
      category: "WFH",
      disputed: false,
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "b-2",
      title: "Ploy calls in sick today?",
      description: "She sounded rough on yesterday's standup call.",
      subjectUserId: null,
      creatorId: "u-jade",
      lockTime: new Date(now + 60 * 60 * 1000).toISOString(),
      status: "open",
      outcome: null,
      category: "Sick",
      disputed: false,
      createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "b-3",
      title: "Pete late to the 9am standup?",
      description: "Three-day streak so far.",
      subjectUserId: "u-pete",
      creatorId: "u-nat",
      lockTime: new Date(now - 60 * 60 * 1000).toISOString(),
      status: "resolved",
      outcome: "yes",
      category: "Late",
      disputed: false,
      createdAt: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const wagers: Wager[] = [
    { id: "w-1", betId: "b-1", userId: "u-sai", side: "yes", amount: 100, payout: null },
    { id: "w-2", betId: "b-1", userId: "u-jade", side: "yes", amount: 200, payout: null },
    { id: "w-3", betId: "b-1", userId: "u-pete", side: "no", amount: 300, payout: null },
    { id: "w-4", betId: "b-2", userId: "u-nat", side: "no", amount: 150, payout: null },
    { id: "w-5", betId: "b-2", userId: "u-sai", side: "yes", amount: 50, payout: null },
    { id: "w-6", betId: "b-3", userId: "u-jade", side: "yes", amount: 100, payout: 175 },
    { id: "w-7", betId: "b-3", userId: "u-nat", side: "no", amount: 75, payout: 0 },
  ];

  const transactions: Transaction[] = [];

  const comments: Comment[] = [
    {
      id: "c-1",
      betId: "b-1",
      userId: "u-pete",
      text: "No chance, he's got the 9:30 dentist thing tomorrow not today.",
      timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
    },
    {
      id: "c-2",
      betId: "b-1",
      userId: "u-jade",
      text: "He literally said \"ugh traffic\" in the chat lol",
      timestamp: new Date(now - 20 * 60 * 1000).toISOString(),
    },
  ];

  return { users, bets, wagers, transactions, comments, stipendLog: {} };
}

function load(): State {
  if (typeof localStorage === "undefined") return seedState();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as State;
    // Migrate state saved before categories/comments/disputes existed.
    return {
      ...parsed,
      comments: parsed.comments ?? [],
      bets: parsed.bets.map((b) => ({
        ...b,
        category: b.category ?? "Custom",
        disputed: b.disputed ?? false,
      })),
    };
  } catch {
    return seedState();
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function persist() {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- Auth (name + shared team PIN, open self-signup) ----

export function getCurrentUserId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function getCurrentUser(): User | null {
  const id = getCurrentUserId();
  return state.users.find((u) => u.id === id) ?? null;
}

export function login(name: string): User {
  const trimmed = name.trim();
  let user = state.users.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
  if (!user) {
    user = { id: uid("u"), name: trimmed, tokenBalance: STARTING_BALANCE };
    state = { ...state, users: [...state.users, user] };
  }
  localStorage.setItem(CURRENT_USER_KEY, user.id);
  persist();
  applyWeeklyStipendIfDue(user.id);
  return user;
}

export function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  listeners.forEach((l) => l());
}

function applyWeeklyStipendIfDue(userId: string) {
  const last = state.stipendLog[userId];
  const due = !last || Date.now() - new Date(last).getTime() > WEEK_MS;
  if (!due) return;

  const users = state.users.map((u) =>
    u.id === userId ? { ...u, tokenBalance: u.tokenBalance + WEEKLY_STIPEND } : u,
  );
  const transactions = [
    ...state.transactions,
    {
      id: uid("t"),
      userId,
      type: "stipend" as const,
      amount: WEEKLY_STIPEND,
      timestamp: new Date().toISOString(),
    },
  ];
  state = { ...state, users, transactions, stipendLog: { ...state.stipendLog, [userId]: new Date().toISOString() } };
  persist();
}

// ---- Derived helpers ----

export function effectiveStatus(bet: Bet): BetStatus {
  if (bet.status === "open" && Date.now() >= new Date(bet.lockTime).getTime()) {
    return "locked";
  }
  return bet.status;
}

export function betTotals(betId: string) {
  const wagers = state.wagers.filter((w) => w.betId === betId);
  const yes = wagers.filter((w) => w.side === "yes").reduce((sum, w) => sum + w.amount, 0);
  const no = wagers.filter((w) => w.side === "no").reduce((sum, w) => sum + w.amount, 0);
  return { yes, no, total: yes + no, wagers };
}

export function userPosition(betId: string, userId: string) {
  return state.wagers.find((w) => w.betId === betId && w.userId === userId) ?? null;
}

// ---- Mutations ----

export function createBet(input: {
  title: string;
  description: string;
  subjectUserId: string | null;
  creatorId: string;
  lockTime: string;
  category: BetCategory;
}): Bet {
  const bet: Bet = {
    id: uid("b"),
    title: input.title,
    description: input.description,
    subjectUserId: input.subjectUserId,
    creatorId: input.creatorId,
    lockTime: input.lockTime,
    status: "open",
    outcome: null,
    category: input.category,
    disputed: false,
    createdAt: new Date().toISOString(),
  };
  state = { ...state, bets: [bet, ...state.bets] };
  persist();
  return bet;
}

export function placeWager(betId: string, userId: string, side: Side, amount: number) {
  const bet = state.bets.find((b) => b.id === betId);
  const user = state.users.find((u) => u.id === userId);
  if (!bet) throw new Error("Bet not found");
  if (!user) throw new Error("User not found");
  if (effectiveStatus(bet) !== "open") throw new Error("Bet is no longer accepting wagers");
  if (amount < MIN_WAGER) throw new Error(`Minimum wager is ${MIN_WAGER} tokens`);
  if (amount > user.tokenBalance) throw new Error("Insufficient balance");

  const existing = userPosition(betId, userId);
  if (existing && existing.side !== side) {
    throw new Error("You already have a position on the other side of this bet");
  }

  const wager: Wager = existing
    ? { ...existing, amount: existing.amount + amount }
    : { id: uid("w"), betId, userId, side, amount, payout: null };

  const wagers = existing
    ? state.wagers.map((w) => (w.id === existing.id ? wager : w))
    : [...state.wagers, wager];

  const users = state.users.map((u) =>
    u.id === userId ? { ...u, tokenBalance: u.tokenBalance - amount } : u,
  );

  const transactions = [
    ...state.transactions,
    { id: uid("t"), userId, type: "wager" as const, amount: -amount, timestamp: new Date().toISOString() },
  ];

  state = { ...state, wagers, users, transactions };
  persist();
  return wager;
}

export function resolveBet(betId: string, outcome: Side) {
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet) throw new Error("Bet not found");
  if (bet.status === "resolved" || bet.status === "void") throw new Error("Bet already settled");

  const { yes, no, wagers } = betTotals(betId);
  const winningTotal = outcome === "yes" ? yes : no;
  const losingTotal = outcome === "yes" ? no : yes;

  if (winningTotal === 0 || losingTotal === 0) {
    return voidBet(betId);
  }

  const users = [...state.users];
  const transactions = [...state.transactions];
  const updatedWagers = wagers.map((w) => {
    if (w.side !== outcome) {
      return { ...w, payout: 0 };
    }
    const payout = w.amount + (w.amount / winningTotal) * losingTotal;
    const idx = users.findIndex((u) => u.id === w.userId);
    if (idx >= 0) users[idx] = { ...users[idx], tokenBalance: users[idx].tokenBalance + payout };
    transactions.push({
      id: uid("t"),
      userId: w.userId,
      type: "payout",
      amount: payout,
      timestamp: new Date().toISOString(),
    });
    return { ...w, payout };
  });

  const allWagers = state.wagers.map((w) => updatedWagers.find((u) => u.id === w.id) ?? w);
  const bets = state.bets.map((b) => (b.id === betId ? { ...b, status: "resolved" as const, outcome } : b));

  state = { ...state, bets, wagers: allWagers, users, transactions };
  persist();
}

export function voidBet(betId: string) {
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet) throw new Error("Bet not found");

  const wagers = state.wagers.filter((w) => w.betId === betId);
  const users = [...state.users];
  const transactions = [...state.transactions];

  wagers.forEach((w) => {
    const idx = users.findIndex((u) => u.id === w.userId);
    if (idx >= 0) users[idx] = { ...users[idx], tokenBalance: users[idx].tokenBalance + w.amount };
    transactions.push({
      id: uid("t"),
      userId: w.userId,
      type: "refund",
      amount: w.amount,
      timestamp: new Date().toISOString(),
    });
  });

  const allWagers = state.wagers.map((w) => (w.betId === betId ? { ...w, payout: w.amount } : w));
  const bets = state.bets.map((b) => (b.id === betId ? { ...b, status: "void" as const } : b));

  state = { ...state, bets, wagers: allWagers, users, transactions };
  persist();
}

// ---- Comments ----

export function addComment(betId: string, userId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const comment: Comment = { id: uid("c"), betId, userId, text: trimmed, timestamp: new Date().toISOString() };
  state = { ...state, comments: [...state.comments, comment] };
  persist();
  return comment;
}

// ---- Disputes ----
// Simplest MVP answer per the spec is "trust the resolver"; this is the
// lightweight escalation path — flag a settled bet, then anyone can
// re-resolve it, which reverses the previous payout/refund and re-applies
// the new outcome.

export function flagDispute(betId: string) {
  const bets = state.bets.map((b) => (b.id === betId ? { ...b, disputed: true } : b));
  state = { ...state, bets };
  persist();
}

export function reResolve(betId: string, outcome: Side) {
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet) throw new Error("Bet not found");
  if (bet.status !== "resolved" && bet.status !== "void") {
    throw new Error("Only settled bets can be re-resolved");
  }

  const wagers = state.wagers.filter((w) => w.betId === betId);
  const users = [...state.users];
  const transactions = [...state.transactions];

  wagers.forEach((w) => {
    if (w.payout === null) return;
    const idx = users.findIndex((u) => u.id === w.userId);
    if (idx >= 0) users[idx] = { ...users[idx], tokenBalance: users[idx].tokenBalance - w.payout! };
    transactions.push({
      id: uid("t"),
      userId: w.userId,
      type: "refund",
      amount: -w.payout!,
      timestamp: new Date().toISOString(),
    });
  });

  const revertedWagers = state.wagers.map((w) => (w.betId === betId ? { ...w, payout: null } : w));
  const revertedBets = state.bets.map((b) =>
    b.id === betId ? { ...b, status: "locked" as const, outcome: null } : b,
  );

  state = { ...state, bets: revertedBets, wagers: revertedWagers, users, transactions };
  persist();

  resolveBet(betId, outcome);
  state = { ...state, bets: state.bets.map((b) => (b.id === betId ? { ...b, disputed: false } : b)) };
  persist();
}

// ---- Badges / streaks ----

export interface StreakInfo {
  streak: number;
  kind: "win" | "loss" | null;
}

export function currentStreak(userId: string): StreakInfo {
  const settled = state.wagers
    .filter((w) => w.userId === userId && w.payout !== null)
    .map((w) => ({ wager: w, bet: state.bets.find((b) => b.id === w.betId) }))
    .filter((r): r is { wager: Wager; bet: Bet } => !!r.bet && r.bet.status === "resolved")
    .sort((a, b) => new Date(b.bet.createdAt).getTime() - new Date(a.bet.createdAt).getTime());

  let streak = 0;
  let kind: "win" | "loss" | null = null;
  for (const { wager } of settled) {
    const won = wager.payout! > wager.amount;
    const thisKind = won ? "win" : "loss";
    if (streak === 0) {
      kind = thisKind;
      streak = 1;
    } else if (kind === thisKind) {
      streak += 1;
    } else {
      break;
    }
  }
  return { streak, kind: streak > 0 ? kind : null };
}
