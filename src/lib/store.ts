import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type {
  Bet,
  BetCategory,
  BetStatus,
  Comment,
  Loan,
  RouletteBet,
  RouletteBetType,
  RouletteRound,
  Side,
  Transaction,
  User,
  Wager,
} from "../types";
import { ROULETTE_MIN_BET, calculatePayout, rollLuckyNumbers, rollWinningNumber } from "./roulette";

/**
 * Supabase-backed data layer (see supabase/schema.sql +
 * supabase/migrations). Keeps an in-memory cache in sync with the DB via
 * an initial fetch plus realtime subscriptions, and exposes it through
 * subscribe/getState for useSyncExternalStore (src/lib/useStore.ts).
 *
 * Writes are NOT wrapped in DB transactions — each mutation is a sequence
 * of independent inserts/updates. Fine for a trusted friend-group app with
 * no real money at stake; a concurrent double-spend is a shrug, not an
 * incident. If that stops being true, move these into Postgres functions.
 */

const CURRENT_USER_KEY = "office-bets/current-user";

export const STARTING_BALANCE = 1000;
export const WEEKLY_STIPEND = 100;
export const MIN_WAGER = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// House-issued loans, not peer-to-peer — avoids real interpersonal debt
// over fake tokens. Flat (non-compounding) interest: borrow 200 -> owe
// 220, due in 7 days. One active loan per user at a time (enforced by a
// partial unique index in the DB too, not just here).
export const LOAN_MIN = 10;
export const LOAN_CAP = 2000;
export const LOAN_INTEREST_RATE = 0.1;
export const LOAN_TERM_MS = 7 * 24 * 60 * 60 * 1000;

// Everyone's stipend is flat for the app's first week live, so nobody's
// early impression of the game is "why did I get less than them" before
// there's been any real activity to base it on. After that, it scales with
// how many wagers you placed in the trailing 7 days — reads as "play more,
// earn more" instead of pure luck.
export const LAUNCH_DATE = new Date("2026-08-21T00:00:00Z").getTime();

export interface EngagementTier {
  kind: "quiet" | "steady" | "active" | "on_fire";
  label: string;
  minWagers: number;
  amount: number;
}

// Ordered lowest-engagement first.
export const ENGAGEMENT_TIERS: EngagementTier[] = [
  { kind: "quiet", label: "Quiet week", minWagers: 0, amount: 50 },
  { kind: "steady", label: "Steady", minWagers: 1, amount: 100 },
  { kind: "active", label: "Active", minWagers: 3, amount: 150 },
  { kind: "on_fire", label: "On fire", minWagers: 5, amount: 250 },
];

export interface StipendAlert {
  amount: number;
  kind: "flat" | EngagementTier["kind"];
}

interface State {
  users: User[];
  bets: Bet[];
  wagers: Wager[];
  transactions: Transaction[];
  comments: Comment[];
  rouletteRounds: RouletteRound[];
  rouletteBets: RouletteBet[];
  loans: Loan[];
  loading: boolean;
  error: string | null;
  stipendAlert: StipendAlert | null;
}

let state: State = {
  users: [],
  bets: [],
  wagers: [],
  transactions: [],
  comments: [],
  rouletteRounds: [],
  rouletteBets: [],
  loans: [],
  loading: true,
  error: null,
  stipendAlert: null,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

function requireClient() {
  if (!supabase) {
    throw new Error("Supabase isn't configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
  }
  return supabase;
}

// ---- Row <-> app-type mapping (DB is snake_case, app is camelCase) ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function mapUser(row: Row): User {
  return {
    id: row.id,
    name: row.name,
    tokenBalance: Number(row.token_balance),
    avatarEmoji: row.avatar_emoji ?? null,
    avatarColor: row.avatar_color ?? null,
  };
}
function mapBet(row: Row): Bet {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subjectUserIds: row.subject_user_ids ?? [],
    subjectNames: row.subject_names ?? [],
    creatorId: row.creator_id,
    lockTime: row.lock_time,
    status: row.status,
    outcome: row.outcome,
    category: row.category,
    disputed: row.disputed,
    createdAt: row.created_at,
  };
}
function mapWager(row: Row): Wager {
  return {
    id: row.id,
    betId: row.bet_id,
    userId: row.user_id,
    side: row.side,
    amount: Number(row.amount),
    payout: row.payout === null ? null : Number(row.payout),
  };
}
function mapTransaction(row: Row): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: Number(row.amount),
    betId: row.bet_id ?? null,
    counterpartyUserId: row.counterparty_user_id ?? null,
    timestamp: row.timestamp,
  };
}
function mapComment(row: Row): Comment {
  return { id: row.id, betId: row.bet_id, userId: row.user_id, text: row.text, timestamp: row.created_at };
}
function mapRouletteRound(row: Row): RouletteRound {
  return {
    id: row.id,
    status: row.status,
    bettingClosesAt: row.betting_closes_at,
    luckyNumbers: row.lucky_numbers ?? null,
    winningNumber: row.winning_number ?? null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  };
}
function mapRouletteBet(row: Row): RouletteBet {
  return {
    id: row.id,
    roundId: row.round_id,
    userId: row.user_id,
    betType: row.bet_type,
    betValue: row.bet_value ?? null,
    amount: Number(row.amount),
    payout: row.payout === null ? null : Number(row.payout),
  };
}
function mapLoan(row: Row): Loan {
  return {
    id: row.id,
    userId: row.user_id,
    principal: Number(row.principal),
    interestRate: Number(row.interest_rate),
    amountOwed: Number(row.amount_owed),
    status: row.status,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    repaidAt: row.repaid_at ?? null,
  };
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}
function removeById<T extends { id: string }>(list: T[], id: string) {
  return list.filter((x) => x.id !== id);
}

// ---- Init: initial fetch + live sync ----
//
// postgres_changes realtime events never arrived in testing (channel
// reports SUBSCRIBED, table is correctly in the supabase_realtime
// publication, RLS is fully permissive, tried both the new publishable key
// and the legacy JWT anon key — still nothing). Root cause is unconfirmed
// and looks project/server-side, outside what's debuggable from the
// client. Rather than block on that, this polls + refetches on tab focus
// as a reliable fallback; the realtime subscription is left in place in
// case it starts working, but nothing depends on it.

let initialized = false;
const POLL_INTERVAL_MS = 15_000;

async function fetchAll() {
  const client = requireClient();
  const [users, bets, wagers, transactions, comments] = await Promise.all([
    client.from("users").select("*"),
    client.from("bets").select("*").order("created_at", { ascending: false }),
    client.from("wagers").select("*"),
    client.from("transactions").select("*"),
    client.from("comments").select("*").order("created_at", { ascending: true }),
  ]);
  const firstError = [users, bets, wagers, transactions, comments].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  setState({
    users: (users.data ?? []).map(mapUser),
    bets: (bets.data ?? []).map(mapBet),
    wagers: (wagers.data ?? []).map(mapWager),
    transactions: (transactions.data ?? []).map(mapTransaction),
    comments: (comments.data ?? []).map(mapComment),
  });

  // Fetched separately and never allowed to block the rest of the app —
  // these migrations might not be applied yet on every environment, and a
  // missing table here shouldn't take down Feed/bets/profile.
  await pollRoulette();
  await fetchLoans();
}

async function fetchLoans() {
  const client = requireClient();
  const { data, error } = await client.from("loans").select("*");
  if (error) return;
  setState({ loans: (data ?? []).map(mapLoan) });
}

// Fires a browser notification when a bet the current user has a wager on
// transitions into resolved/void. Only called from the polling paths, never
// from the initial load — otherwise every already-settled bet in history
// would fire a notification the moment the page opens. Bets that appear
// mid-poll with no prior snapshot are treated as already-settled (skipped)
// rather than risk a false positive from an unknown prior state.
function notifyOnResolutions(prevBets: Bet[], newBets: Bet[], wagers: Wager[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const currentUserId = getCurrentUserId();
  if (!currentUserId) return;

  for (const bet of newBets) {
    const prev = prevBets.find((b) => b.id === bet.id);
    const wasSettled = prev ? prev.status === "resolved" || prev.status === "void" : true;
    const isSettled = bet.status === "resolved" || bet.status === "void";
    if (wasSettled || !isSettled) continue;

    const myWager = wagers.find((w) => w.betId === bet.id && w.userId === currentUserId);
    if (!myWager) continue;

    const body =
      bet.status === "void"
        ? "Voided — your stake was refunded."
        : myWager.payout !== null && myWager.payout > myWager.amount
          ? `You won! +${Math.round(myWager.payout - myWager.amount)} tokens`
          : "Resolved — this one didn't go your way.";

    new Notification(bet.title, { body, icon: "/favicon.svg" });
  }
}

async function pollAndNotify() {
  const prevBets = state.bets;
  await fetchAll();
  notifyOnResolutions(prevBets, state.bets, state.wagers);
}

// The global 15s poll is too slow for a 20s betting round to feel alive —
// this is a lighter, roulette-only refetch the Roulette page calls on its
// own fast interval while mounted, instead of widening the poll for every
// page.
export async function pollRoulette() {
  const client = requireClient();
  const [rounds, bets] = await Promise.all([
    client.from("roulette_rounds").select("*").order("created_at", { ascending: false }).limit(20),
    client.from("roulette_bets").select("*").order("created_at", { ascending: false }).limit(500),
  ]);
  if (rounds.error || bets.error) return;
  setState({
    rouletteRounds: (rounds.data ?? []).map(mapRouletteRound),
    rouletteBets: (bets.data ?? []).map(mapRouletteBet),
  });
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  return Notification.requestPermission();
}

export async function initStore() {
  if (initialized) return;
  initialized = true;
  const client = requireClient();

  try {
    await fetchAll();
    setState({ loading: false });
  } catch (err) {
    setState({ loading: false, error: err instanceof Error ? err.message : "Failed to load" });
    return;
  }

  client
    .channel("office-bets-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "users" }, (payload) =>
      applyChange(payload, "users", mapUser),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, (payload) =>
      applyChange(payload, "bets", mapBet),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "wagers" }, (payload) =>
      applyChange(payload, "wagers", mapWager),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, (payload) =>
      applyChange(payload, "transactions", mapTransaction),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (payload) =>
      applyChange(payload, "comments", mapComment),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "roulette_rounds" }, (payload) =>
      applyChange(payload, "rouletteRounds", mapRouletteRound),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "roulette_bets" }, (payload) =>
      applyChange(payload, "rouletteBets", mapRouletteBet),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "loans" }, (payload) =>
      applyChange(payload, "loans", mapLoan),
    )
    .subscribe();

  setInterval(() => {
    pollAndNotify().catch(() => {});
  }, POLL_INTERVAL_MS);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pollAndNotify().catch(() => {});
    });
  }
}

function applyChange<
  K extends
    | "users"
    | "bets"
    | "wagers"
    | "transactions"
    | "comments"
    | "rouletteRounds"
    | "rouletteBets"
    | "loans",
>(
  payload: RealtimePostgresChangesPayload<Row>,
  key: K,
  mapper: (row: Row) => State[K][number],
) {
  if (payload.eventType === "DELETE") {
    const oldId = (payload.old as Row).id as string;
    setState({ [key]: removeById(state[key] as { id: string }[], oldId) } as Partial<State>);
    return;
  }
  const item = mapper(payload.new as Row);
  setState({ [key]: upsertById(state[key] as { id: string }[], item) } as Partial<State>);
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

export async function login(name: string): Promise<User> {
  const client = requireClient();
  const trimmed = name.trim();

  const { data: existing, error: findErr } = await client
    .from("users")
    .select("*")
    .ilike("name", trimmed)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  let user: User;
  if (existing) {
    user = mapUser(existing);
  } else {
    const { data: created, error: insertErr } = await client
      .from("users")
      .insert({ name: trimmed, token_balance: STARTING_BALANCE })
      .select()
      .single();
    if (insertErr) throw new Error(insertErr.message);
    user = mapUser(created);
  }

  setState({ users: upsertById(state.users, user) });
  localStorage.setItem(CURRENT_USER_KEY, user.id);
  listeners.forEach((l) => l());

  await applyWeeklyStipendIfDue(user, existing?.last_stipend_at ?? null);
  await collectLoanIfDue(user.id);
  return user;
}

export function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  listeners.forEach((l) => l());
}

export function isFlatStipendWeek(now = Date.now()): boolean {
  return now < LAUNCH_DATE + WEEK_MS;
}

// How many wagers a user placed in the trailing 7 days — the engagement
// signal the stipend tier is based on once the flat first week is over.
export function weeklyWagerCount(userId: string, now = Date.now()): number {
  const cutoff = now - WEEK_MS;
  return state.transactions.filter(
    (t) => t.userId === userId && t.type === "wager" && new Date(t.timestamp).getTime() >= cutoff,
  ).length;
}

export function engagementTierFor(wagerCount: number): EngagementTier {
  let tier = ENGAGEMENT_TIERS[0];
  for (const t of ENGAGEMENT_TIERS) {
    if (wagerCount >= t.minWagers) tier = t;
  }
  return tier;
}

// What a user's next weekly stipend will be if collected right now — used
// both to actually roll it at login and to preview it in the Profile Token
// tab, so the two can never drift apart.
export function projectedStipend(
  userId: string,
  now = Date.now(),
): { amount: number; kind: StipendAlert["kind"]; tier: EngagementTier | null; wagerCount: number } {
  const wagerCount = weeklyWagerCount(userId, now);
  if (isFlatStipendWeek(now)) {
    return { amount: WEEKLY_STIPEND, kind: "flat", tier: null, wagerCount };
  }
  const tier = engagementTierFor(wagerCount);
  return { amount: tier.amount, kind: tier.kind, tier, wagerCount };
}

async function applyWeeklyStipendIfDue(user: User, lastStipendAt: string | null) {
  const due = !lastStipendAt || Date.now() - new Date(lastStipendAt).getTime() > WEEK_MS;
  if (!due) return;

  const { amount, kind } = projectedStipend(user.id);
  const stipend: StipendAlert = { amount, kind };
  const client = requireClient();
  const { data: updated, error } = await client
    .from("users")
    .update({ token_balance: user.tokenBalance + stipend.amount, last_stipend_at: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .single();
  if (error) return; // non-critical — don't block login over a missed stipend

  setState({ users: upsertById(state.users, mapUser(updated)), stipendAlert: stipend });
  const { data: txnRow } = await client
    .from("transactions")
    .insert({ user_id: user.id, type: "stipend", amount: stipend.amount })
    .select()
    .single();
  if (txnRow) setState({ transactions: upsertById(state.transactions, mapTransaction(txnRow)) });
}

export function clearStipendAlert() {
  setState({ stipendAlert: null });
}

// ---- Loans ----

export function activeLoanFor(userId: string): Loan | null {
  return state.loans.find((l) => l.userId === userId && (l.status === "active" || l.status === "overdue")) ?? null;
}

export async function borrowTokens(userId: string, amount: number): Promise<void> {
  const user = state.users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");
  if (activeLoanFor(userId)) throw new Error("Pay off your current loan before borrowing again");
  if (!Number.isInteger(amount) || amount < LOAN_MIN) {
    throw new Error(`Loans must be a whole number of at least ${LOAN_MIN} tokens`);
  }
  if (amount > LOAN_CAP) throw new Error(`Can't borrow more than ${LOAN_CAP} tokens`);

  const client = requireClient();
  const { data: loanRow, error: loanErr } = await client
    .from("loans")
    .insert({
      user_id: userId,
      principal: amount,
      interest_rate: LOAN_INTEREST_RATE,
      amount_owed: amount * (1 + LOAN_INTEREST_RATE),
      due_at: new Date(Date.now() + LOAN_TERM_MS).toISOString(),
    })
    .select()
    .single();
  if (loanErr) throw new Error(loanErr.message);

  const { data: userRow, error: userErr } = await client
    .from("users")
    .update({ token_balance: user.tokenBalance + amount })
    .eq("id", userId)
    .select()
    .single();
  if (userErr) throw new Error(userErr.message);

  const { data: txnRow } = await client
    .from("transactions")
    .insert({ user_id: userId, type: "loan", amount })
    .select()
    .single();

  setState({
    loans: upsertById(state.loans, mapLoan(loanRow)),
    users: upsertById(state.users, mapUser(userRow)),
    transactions: txnRow ? upsertById(state.transactions, mapTransaction(txnRow)) : state.transactions,
  });
}

export async function repayLoan(userId: string): Promise<void> {
  const loan = activeLoanFor(userId);
  if (!loan) throw new Error("No active loan");
  const user = state.users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");
  if (user.tokenBalance < loan.amountOwed) throw new Error("Not enough tokens to repay in full");

  const client = requireClient();
  const { data: userRow, error: userErr } = await client
    .from("users")
    .update({ token_balance: user.tokenBalance - loan.amountOwed })
    .eq("id", userId)
    .select()
    .single();
  if (userErr) throw new Error(userErr.message);

  const { data: loanRow, error: loanErr } = await client
    .from("loans")
    .update({ status: "repaid", amount_owed: 0, repaid_at: new Date().toISOString() })
    .eq("id", loan.id)
    .eq("status", loan.status)
    .select()
    .maybeSingle();
  if (loanErr) throw new Error(loanErr.message);
  if (!loanRow) throw new Error("This loan was already settled");

  const { data: txnRow } = await client
    .from("transactions")
    .insert({ user_id: userId, type: "repayment", amount: -loan.amountOwed })
    .select()
    .single();

  setState({
    users: upsertById(state.users, mapUser(userRow)),
    loans: upsertById(state.loans, mapLoan(loanRow)),
    transactions: txnRow ? upsertById(state.transactions, mapTransaction(txnRow)) : state.transactions,
  });
}

// Called at login. No backend/cron exists in this app, so a loan's due
// date is only actually enforced the next time its owner (or, via the
// realtime/poll sync, anyone loading the app) triggers this check —
// same "honor system, client-triggered" model as everything else here.
// Collects whatever's available from the current balance; never
// overdraws it. A shortfall flips the loan to "overdue" and blocks new
// loans until the remainder is paid off, rather than going negative.
async function collectLoanIfDue(userId: string): Promise<void> {
  const loan = activeLoanFor(userId);
  if (!loan) return;
  if (Date.now() < new Date(loan.dueAt).getTime()) return;

  const user = state.users.find((u) => u.id === userId);
  if (!user) return;

  const payment = Math.min(user.tokenBalance, loan.amountOwed);
  const remaining = loan.amountOwed - payment;
  const newStatus: Loan["status"] = remaining <= 0 ? "repaid" : "overdue";

  const client = requireClient();
  const { data: loanRow, error: loanErr } = await client
    .from("loans")
    .update({
      amount_owed: remaining,
      status: newStatus,
      repaid_at: newStatus === "repaid" ? new Date().toISOString() : null,
    })
    .eq("id", loan.id)
    .eq("status", loan.status)
    .select()
    .maybeSingle();
  if (loanErr || !loanRow) return; // non-critical — next login retries
  setState({ loans: upsertById(state.loans, mapLoan(loanRow)) });

  if (payment <= 0) return;

  const { data: userRow, error: userErr } = await client
    .from("users")
    .update({ token_balance: user.tokenBalance - payment })
    .eq("id", userId)
    .select()
    .single();
  if (!userErr) setState({ users: upsertById(state.users, mapUser(userRow)) });

  const { data: txnRow } = await client
    .from("transactions")
    .insert({ user_id: userId, type: "repayment", amount: -payment })
    .select()
    .single();
  if (txnRow) setState({ transactions: upsertById(state.transactions, mapTransaction(txnRow)) });
}

export async function setAvatarEmoji(userId: string, emoji: string | null) {
  const client = requireClient();
  const { data, error } = await client
    .from("users")
    .update({ avatar_emoji: emoji })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  setState({ users: upsertById(state.users, mapUser(data)) });
}

export async function setAvatarColor(userId: string, color: string | null) {
  const client = requireClient();
  const { data, error } = await client
    .from("users")
    .update({ avatar_color: color })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  setState({ users: upsertById(state.users, mapUser(data)) });
}

export async function renameUser(userId: string, newName: string) {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Enter a name");

  const client = requireClient();
  const { data, error } = await client.from("users").update({ name: trimmed }).eq("id", userId).select().single();
  if (error) {
    // 23505 = unique_violation — users.name has a UNIQUE constraint, so
    // this is the authoritative check rather than a race-prone
    // client-side pre-check against possibly-stale cached user list.
    if (error.code === "23505") throw new Error("That name is already taken");
    throw new Error(error.message);
  }
  setState({ users: upsertById(state.users, mapUser(data)) });
}

// ---- Peer-to-peer transfers ----
// A direct gift/side-payment separate from betting — e.g. spotting a
// teammate some tokens, or settling something outside the formal pot-split
// flow. No real money involved anywhere in this app, so this carries the
// same "zero real stakes" trust level as everything else here.

export async function transferTokens(fromUserId: string, toUserId: string, amount: number) {
  if (fromUserId === toUserId) throw new Error("Can't send tokens to yourself");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Enter a whole positive number of tokens");

  const sender = state.users.find((u) => u.id === fromUserId);
  const receiver = state.users.find((u) => u.id === toUserId);
  if (!sender) throw new Error("Sender not found");
  if (!receiver) throw new Error("Recipient not found");
  if (amount > sender.tokenBalance) throw new Error("Insufficient balance");

  const client = requireClient();

  const { data: senderRow, error: senderErr } = await client
    .from("users")
    .update({ token_balance: sender.tokenBalance - amount })
    .eq("id", fromUserId)
    .select()
    .single();
  if (senderErr) throw new Error(senderErr.message);
  setState({ users: upsertById(state.users, mapUser(senderRow)) });

  try {
    const { data: receiverRow, error: receiverErr } = await client
      .from("users")
      .update({ token_balance: receiver.tokenBalance + amount })
      .eq("id", toUserId)
      .select()
      .single();
    if (receiverErr) throw new Error(receiverErr.message);
    setState({ users: upsertById(state.users, mapUser(receiverRow)) });
  } catch {
    // The sender was already debited — without this, a failure here would
    // silently destroy tokens (charged, nobody credited). Best-effort
    // compensating write to put the sender back where they started.
    const { data: refundRow, error: refundErr } = await client
      .from("users")
      .update({ token_balance: sender.tokenBalance })
      .eq("id", fromUserId)
      .select()
      .single();
    if (refundErr) {
      throw new Error(
        "Transfer failed partway through and the automatic refund also failed — check your balance.",
      );
    }
    setState({ users: upsertById(state.users, mapUser(refundRow)) });
    throw new Error("Transfer failed — nothing was sent, your balance is unchanged.");
  }

  const { data: txnRows, error: logErr } = await client
    .from("transactions")
    .insert([
      { user_id: fromUserId, type: "transfer", amount: -amount, counterparty_user_id: toUserId },
      { user_id: toUserId, type: "transfer", amount, counterparty_user_id: fromUserId },
    ])
    .select();
  if (logErr) {
    // Balances already moved for real at this point — don't roll that back
    // over a logging failure, but don't hide it either.
    throw new Error(`Transfer went through, but the statement entry failed to save: ${logErr.message}`);
  }
  const transactions = txnRows.reduce((list, row) => upsertById(list, mapTransaction(row)), state.transactions);
  setState({ transactions });
}

// ---- Derived helpers ----

export function effectiveStatus(bet: Bet): BetStatus {
  if (bet.status === "open" && Date.now() >= new Date(bet.lockTime).getTime()) {
    return "locked";
  }
  return bet.status;
}

// Registered-user subjects (with avatar info) plus free-text subjects, in
// that order — used anywhere a bet's "about X, Y and Z" line is rendered.
export function betSubjects(bet: Bet) {
  const registered = bet.subjectUserIds
    .map((id) => state.users.find((u) => u.id === id))
    .filter((u): u is User => !!u);
  const names = [...registered.map((u) => u.name), ...bet.subjectNames];
  return { registered, names };
}

export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
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

export async function createBet(input: {
  title: string;
  description: string;
  subjectUserIds: string[];
  subjectNames: string[];
  creatorId: string;
  lockTime: string;
  category: BetCategory;
}): Promise<Bet> {
  const client = requireClient();
  const { data, error } = await client
    .from("bets")
    .insert({
      title: input.title,
      description: input.description,
      subject_user_ids: input.subjectUserIds,
      subject_names: input.subjectNames,
      creator_id: input.creatorId,
      lock_time: input.lockTime,
      category: input.category,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const bet = mapBet(data);
  setState({ bets: upsertById(state.bets, bet) });
  return bet;
}

export async function placeWager(betId: string, userId: string, side: Side, amount: number): Promise<Wager> {
  const client = requireClient();
  const bet = state.bets.find((b) => b.id === betId);
  const user = state.users.find((u) => u.id === userId);
  if (!bet) throw new Error("Bet not found");
  if (!user) throw new Error("User not found");
  if (bet.subjectUserIds.includes(userId)) throw new Error("You can't wager on a bet you're the subject of");
  if (effectiveStatus(bet) !== "open") throw new Error("Bet is no longer accepting wagers");
  if (!Number.isInteger(amount) || amount < MIN_WAGER) {
    throw new Error(`Wagers must be a whole number of at least ${MIN_WAGER} tokens`);
  }
  if (amount > user.tokenBalance) throw new Error("Insufficient balance");

  const existing = userPosition(betId, userId);
  if (existing && existing.side !== side) {
    throw new Error("You already have a position on the other side of this bet");
  }

  const { data: wagerRow, error: wagerErr } = existing
    ? await client.from("wagers").update({ amount: existing.amount + amount }).eq("id", existing.id).select().single()
    : await client.from("wagers").insert({ bet_id: betId, user_id: userId, side, amount }).select().single();
  if (wagerErr) throw new Error(wagerErr.message);

  const { data: userRow, error: userErr } = await client
    .from("users")
    .update({ token_balance: user.tokenBalance - amount })
    .eq("id", userId)
    .select()
    .single();
  if (userErr) throw new Error(userErr.message);

  const { data: txnRow } = await client
    .from("transactions")
    .insert({ user_id: userId, type: "wager", amount: -amount, bet_id: betId })
    .select()
    .single();

  const wager = mapWager(wagerRow);
  setState({
    wagers: upsertById(state.wagers, wager),
    users: upsertById(state.users, mapUser(userRow)),
    transactions: txnRow ? upsertById(state.transactions, mapTransaction(txnRow)) : state.transactions,
  });
  return wager;
}

export async function resolveBet(betId: string, outcome: Side): Promise<void> {
  const client = requireClient();
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet) throw new Error("Bet not found");
  if (bet.status === "resolved" || bet.status === "void") throw new Error("Bet already settled");

  const { yes, no, wagers } = betTotals(betId);
  const winningTotal = outcome === "yes" ? yes : no;
  const losingTotal = outcome === "yes" ? no : yes;

  if (winningTotal === 0 || losingTotal === 0) {
    return voidBet(betId);
  }

  // Claim the bet atomically before paying anyone out — a conditional update
  // that only succeeds from open/locked means a double-click or a retried
  // request can't run this payout loop twice for the same bet.
  const { data: claimedRow, error: claimErr } = await client
    .from("bets")
    .update({ status: "resolved", outcome })
    .eq("id", betId)
    .in("status", ["open", "locked"])
    .select()
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimedRow) throw new Error("Bet already settled");
  setState({ bets: upsertById(state.bets, mapBet(claimedRow)) });

  for (const w of wagers) {
    const payout = w.side === outcome ? w.amount + (w.amount / winningTotal) * losingTotal : 0;

    const { data: wagerRow, error: wagerErr } = await client
      .from("wagers")
      .update({ payout })
      .eq("id", w.id)
      .select()
      .single();
    if (wagerErr) throw new Error(wagerErr.message);
    setState({ wagers: upsertById(state.wagers, mapWager(wagerRow)) });

    if (payout > 0) {
      const user = state.users.find((u) => u.id === w.userId);
      if (user) {
        const { data: userRow, error: userErr } = await client
          .from("users")
          .update({ token_balance: user.tokenBalance + payout })
          .eq("id", user.id)
          .select()
          .single();
        if (!userErr) setState({ users: upsertById(state.users, mapUser(userRow)) });
      }
      const { data: txnRow } = await client
        .from("transactions")
        .insert({ user_id: w.userId, type: "payout", amount: payout, bet_id: betId })
        .select()
        .single();
      if (txnRow) setState({ transactions: upsertById(state.transactions, mapTransaction(txnRow)) });
    }
  }
}

export async function voidBet(betId: string): Promise<void> {
  const client = requireClient();
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet) throw new Error("Bet not found");

  // Same atomic claim as resolveBet — see the comment there.
  const { data: claimedRow, error: claimErr } = await client
    .from("bets")
    .update({ status: "void" })
    .eq("id", betId)
    .in("status", ["open", "locked"])
    .select()
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimedRow) throw new Error("Bet already settled");
  setState({ bets: upsertById(state.bets, mapBet(claimedRow)) });

  const wagers = state.wagers.filter((w) => w.betId === betId);
  for (const w of wagers) {
    const { data: wagerRow, error: wagerErr } = await client
      .from("wagers")
      .update({ payout: w.amount })
      .eq("id", w.id)
      .select()
      .single();
    if (wagerErr) throw new Error(wagerErr.message);
    setState({ wagers: upsertById(state.wagers, mapWager(wagerRow)) });

    const user = state.users.find((u) => u.id === w.userId);
    if (user) {
      const { data: userRow, error: userErr } = await client
        .from("users")
        .update({ token_balance: user.tokenBalance + w.amount })
        .eq("id", user.id)
        .select()
        .single();
      if (!userErr) setState({ users: upsertById(state.users, mapUser(userRow)) });
    }
    const { data: txnRow } = await client
      .from("transactions")
      .insert({ user_id: w.userId, type: "refund", amount: w.amount, bet_id: betId })
      .select()
      .single();
    if (txnRow) setState({ transactions: upsertById(state.transactions, mapTransaction(txnRow)) });
  }
}

// Creator-only, and only before a bet settles — once it's resolved/void the
// outcome may already be reflected in balances, streaks, and leaderboard
// history, so removing it silently would be more confusing than helpful.
// Any wagers placed before deletion are refunded first, same as voidBet,
// so tokens never just disappear.
export async function deleteBet(betId: string, requestingUserId: string): Promise<void> {
  const client = requireClient();
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet) throw new Error("Bet not found");
  if (bet.creatorId !== requestingUserId) throw new Error("Only the creator can delete this bet");
  if (bet.status === "resolved" || bet.status === "void") {
    throw new Error("Can't delete a settled bet — flag it as disputed instead");
  }

  const wagers = state.wagers.filter((w) => w.betId === betId);
  for (const w of wagers) {
    const user = state.users.find((u) => u.id === w.userId);
    if (user) {
      const { data: userRow, error: userErr } = await client
        .from("users")
        .update({ token_balance: user.tokenBalance + w.amount })
        .eq("id", user.id)
        .select()
        .single();
      if (!userErr) setState({ users: upsertById(state.users, mapUser(userRow)) });
    }
    const { data: txnRow } = await client
      .from("transactions")
      .insert({ user_id: w.userId, type: "refund", amount: w.amount, bet_id: betId })
      .select()
      .single();
    if (txnRow) setState({ transactions: upsertById(state.transactions, mapTransaction(txnRow)) });
  }

  const { error: deleteErr } = await client.from("bets").delete().eq("id", betId);
  if (deleteErr) throw new Error(deleteErr.message);

  setState({
    bets: removeById(state.bets, betId),
    wagers: state.wagers.filter((w) => w.betId !== betId),
    comments: state.comments.filter((c) => c.betId !== betId),
  });
}

// ---- Comments ----

export async function addComment(betId: string, userId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const client = requireClient();
  const { data, error } = await client
    .from("comments")
    .insert({ bet_id: betId, user_id: userId, text: trimmed })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const comment = mapComment(data);
  setState({ comments: upsertById(state.comments, comment) });
  return comment;
}

// ---- Disputes ----
// Simplest MVP answer per the spec is "trust the resolver"; this is the
// lightweight escalation path — flag a settled bet, then anyone can
// re-resolve it, which reverses the previous payout/refund and re-applies
// the new outcome.

export async function flagDispute(betId: string) {
  const client = requireClient();
  const { data, error } = await client.from("bets").update({ disputed: true }).eq("id", betId).select().single();
  if (error) throw new Error(error.message);
  setState({ bets: upsertById(state.bets, mapBet(data)) });
}

export async function reResolve(betId: string, outcome: Side) {
  const client = requireClient();
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet) throw new Error("Bet not found");
  if (bet.status !== "resolved" && bet.status !== "void") {
    throw new Error("Only settled bets can be re-resolved");
  }

  // Same atomic claim as resolveBet — flip to "locked" first so a
  // double-click can't run the reversal loop below twice.
  const { data: lockedRow, error: lockErr } = await client
    .from("bets")
    .update({ status: "locked", outcome: null })
    .eq("id", betId)
    .in("status", ["resolved", "void"])
    .select()
    .maybeSingle();
  if (lockErr) throw new Error(lockErr.message);
  if (!lockedRow) throw new Error("This bet is already being re-resolved");
  setState({ bets: upsertById(state.bets, mapBet(lockedRow)) });

  const wagers = state.wagers.filter((w) => w.betId === betId);
  for (const w of wagers) {
    if (w.payout === null) continue;

    const user = state.users.find((u) => u.id === w.userId);
    if (user) {
      const { data: userRow, error: userErr } = await client
        .from("users")
        .update({ token_balance: user.tokenBalance - w.payout })
        .eq("id", user.id)
        .select()
        .single();
      if (!userErr) setState({ users: upsertById(state.users, mapUser(userRow)) });
    }
    const { data: txnRow } = await client
      .from("transactions")
      .insert({ user_id: w.userId, type: "refund", amount: -w.payout, bet_id: betId })
      .select()
      .single();
    if (txnRow) setState({ transactions: upsertById(state.transactions, mapTransaction(txnRow)) });

    const { data: wagerRow, error: wagerErr } = await client
      .from("wagers")
      .update({ payout: null })
      .eq("id", w.id)
      .select()
      .single();
    if (!wagerErr) setState({ wagers: upsertById(state.wagers, mapWager(wagerRow)) });
  }

  await resolveBet(betId, outcome);

  const { data: clearedRow, error: clearErr } = await client
    .from("bets")
    .update({ disputed: false })
    .eq("id", betId)
    .select()
    .single();
  if (!clearErr) setState({ bets: upsertById(state.bets, mapBet(clearedRow)) });
}

// ---- Badges / streaks ----

export interface StreakInfo {
  streak: number;
  kind: "win" | "loss" | null;
}

// Only wagers on bets that actually resolved to yes/no count as a win or a
// loss — a void bet is a refund, not a result. Both Leaderboard and Profile
// used to count void bets as "settled but not a win," which unfairly
// dragged down win rate for something that was never a loss. This is the
// one place that logic lives now.
export function resolvedWagersForUser(userId: string) {
  return state.wagers
    .filter((w) => w.userId === userId && w.payout !== null)
    .map((w) => ({ wager: w, bet: state.bets.find((b) => b.id === w.betId) }))
    .filter((r): r is { wager: Wager; bet: Bet } => !!r.bet && r.bet.status === "resolved");
}

export function userWinStats(userId: string) {
  const resolved = resolvedWagersForUser(userId);
  const wins = resolved.filter((r) => r.wager.payout! > r.wager.amount).length;
  return { settledCount: resolved.length, wins, losses: resolved.length - wins };
}

export function userTransactions(userId: string) {
  return state.transactions
    .filter((t) => t.userId === userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function currentStreak(userId: string): StreakInfo {
  const settled = resolvedWagersForUser(userId).sort(
    (a, b) => new Date(b.bet.createdAt).getTime() - new Date(a.bet.createdAt).getTime(),
  );

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

// ---- Roulette ----
// No backend/cron exists in this app, so every round-lifecycle transition
// below is triggered by whichever connected client's local timer gets
// there first (see roulette.ts and the Roulette page for the timers). Each
// write is filtered on the expected current status, same atomic-claim
// pattern as resolveBet/voidBet, so a simultaneous trigger from multiple
// idle browsers can't double-fire a phase.

export function currentRouletteRound(): RouletteRound | null {
  const active = state.rouletteRounds.find((r) => r.status !== "resolved");
  if (active) return active;
  return (
    [...state.rouletteRounds].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0] ?? null
  );
}

export function rouletteBetsForRound(roundId: string): RouletteBet[] {
  return state.rouletteBets.filter((b) => b.roundId === roundId);
}

// Starts the next round if nothing's currently active — this is what makes
// rounds run back-to-back "whenever someone's in the game": the Roulette
// page calls this on mount and after every resolution, and does nothing if
// a round is already betting/spinning.
export async function ensureActiveRouletteRound(bettingMs: number): Promise<void> {
  if (state.rouletteRounds.some((r) => r.status !== "resolved")) return;
  const client = requireClient();
  const { error } = await client.from("roulette_rounds").insert({
    status: "betting",
    betting_closes_at: new Date(Date.now() + bettingMs).toISOString(),
  });
  // 23505 = the partial unique index caught a race with another client
  // starting the same next round — fine, whoever won is the real one.
  if (error && error.code !== "23505") {
    // Non-critical for a fun feature — the next poll will just retry.
  }
}

export async function closeRouletteBettingIfDue(round: RouletteRound): Promise<void> {
  if (round.status !== "betting") return;
  if (Date.now() < new Date(round.bettingClosesAt).getTime()) return;

  const client = requireClient();
  const luckyNumbers = rollLuckyNumbers();
  const winningNumber = rollWinningNumber();
  const { data, error } = await client
    .from("roulette_rounds")
    .update({ status: "spinning", lucky_numbers: luckyNumbers, winning_number: winningNumber })
    .eq("id", round.id)
    .eq("status", "betting")
    .select()
    .maybeSingle();
  if (!error && data) setState({ rouletteRounds: upsertById(state.rouletteRounds, mapRouletteRound(data)) });
}

// Called by whichever client's local spin animation finishes first, some
// fixed delay after status flipped to "spinning". Pays out every bet on
// the round — losers were already debited when they placed their bet, so
// only winners need a credit + ledger entry here.
export async function resolveRouletteRound(roundId: string): Promise<void> {
  const client = requireClient();
  const { data: claimedRow, error: claimErr } = await client
    .from("roulette_rounds")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", roundId)
    .eq("status", "spinning")
    .select()
    .maybeSingle();
  if (claimErr || !claimedRow) return; // someone else already resolved it
  const round = mapRouletteRound(claimedRow);
  setState({ rouletteRounds: upsertById(state.rouletteRounds, round) });
  if (round.winningNumber === null) return;

  const bets = rouletteBetsForRound(roundId);
  for (const bet of bets) {
    const payout = calculatePayout(bet, round.winningNumber, round.luckyNumbers);

    const { data: betRow, error: betErr } = await client
      .from("roulette_bets")
      .update({ payout })
      .eq("id", bet.id)
      .select()
      .single();
    if (!betErr) setState({ rouletteBets: upsertById(state.rouletteBets, mapRouletteBet(betRow)) });
    if (payout <= 0) continue;

    const user = state.users.find((u) => u.id === bet.userId);
    if (user) {
      const { data: userRow, error: userErr } = await client
        .from("users")
        .update({ token_balance: user.tokenBalance + payout })
        .eq("id", user.id)
        .select()
        .single();
      if (!userErr) setState({ users: upsertById(state.users, mapUser(userRow)) });
    }
    const { data: txnRow } = await client
      .from("transactions")
      .insert({ user_id: bet.userId, type: "roulette", amount: payout })
      .select()
      .single();
    if (txnRow) setState({ transactions: upsertById(state.transactions, mapTransaction(txnRow)) });
  }
}

export async function placeRouletteBet(
  roundId: string,
  userId: string,
  betType: RouletteBetType,
  betValue: string | null,
  amount: number,
): Promise<void> {
  const round = state.rouletteRounds.find((r) => r.id === roundId);
  const user = state.users.find((u) => u.id === userId);
  if (!round) throw new Error("Round not found");
  if (!user) throw new Error("User not found");
  if (round.status !== "betting") throw new Error("Betting is closed for this round");
  if (!Number.isInteger(amount) || amount < ROULETTE_MIN_BET) {
    throw new Error(`Bets must be a whole number of at least ${ROULETTE_MIN_BET} tokens`);
  }
  if (amount > user.tokenBalance) throw new Error("Insufficient balance");

  const client = requireClient();
  const { data: betRow, error: betErr } = await client
    .from("roulette_bets")
    .insert({ round_id: roundId, user_id: userId, bet_type: betType, bet_value: betValue, amount })
    .select()
    .single();
  if (betErr) throw new Error(betErr.message);

  const { data: userRow, error: userErr } = await client
    .from("users")
    .update({ token_balance: user.tokenBalance - amount })
    .eq("id", userId)
    .select()
    .single();
  if (userErr) throw new Error(userErr.message);

  const { data: txnRow } = await client
    .from("transactions")
    .insert({ user_id: userId, type: "roulette", amount: -amount })
    .select()
    .single();

  setState({
    rouletteBets: upsertById(state.rouletteBets, mapRouletteBet(betRow)),
    users: upsertById(state.users, mapUser(userRow)),
    transactions: txnRow ? upsertById(state.transactions, mapTransaction(txnRow)) : state.transactions,
  });
}
