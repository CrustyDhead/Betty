import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Bet, BetCategory, BetStatus, Comment, Side, Transaction, User, Wager } from "../types";

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

export interface StipendAlert {
  amount: number;
  kind: "normal" | "boosted" | "jackpot";
}

interface State {
  users: User[];
  bets: Bet[];
  wagers: Wager[];
  transactions: Transaction[];
  comments: Comment[];
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
    subjectUserId: row.subject_user_id,
    subjectName: row.subject_name ?? null,
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

function applyChange<K extends "users" | "bets" | "wagers" | "transactions" | "comments">(
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
  return user;
}

export function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  listeners.forEach((l) => l());
}

// Variable-ratio reward: the surprise of an occasional bigger payout drives
// more anticipation than a flat, predictable amount would. Odds are fixed
// and always in the player's favor (never less than WEEKLY_STIPEND) — this
// is meant to make a fake-currency top-up feel more fun, not to manipulate
// anyone into risking more than they intend to.
function rollStipend(): StipendAlert {
  const r = Math.random();
  if (r < 0.1) return { amount: 300, kind: "jackpot" };
  if (r < 0.3) return { amount: 150 + Math.floor(Math.random() * 100), kind: "boosted" };
  return { amount: WEEKLY_STIPEND, kind: "normal" };
}

async function applyWeeklyStipendIfDue(user: User, lastStipendAt: string | null) {
  const due = !lastStipendAt || Date.now() - new Date(lastStipendAt).getTime() > WEEK_MS;
  if (!due) return;

  const stipend = rollStipend();
  const client = requireClient();
  const { data: updated, error } = await client
    .from("users")
    .update({ token_balance: user.tokenBalance + stipend.amount, last_stipend_at: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .single();
  if (error) return; // non-critical — don't block login over a missed stipend

  setState({ users: upsertById(state.users, mapUser(updated)), stipendAlert: stipend });
  await client.from("transactions").insert({ user_id: user.id, type: "stipend", amount: stipend.amount });
}

export function clearStipendAlert() {
  setState({ stipendAlert: null });
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

  await client.from("transactions").insert([
    { user_id: fromUserId, type: "transfer", amount: -amount, counterparty_user_id: toUserId },
    { user_id: toUserId, type: "transfer", amount, counterparty_user_id: fromUserId },
  ]);
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

export async function createBet(input: {
  title: string;
  description: string;
  subjectUserId: string | null;
  subjectName: string | null;
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
      subject_user_id: input.subjectUserId,
      subject_name: input.subjectName,
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

  await client.from("transactions").insert({ user_id: userId, type: "wager", amount: -amount, bet_id: betId });

  const wager = mapWager(wagerRow);
  setState({ wagers: upsertById(state.wagers, wager), users: upsertById(state.users, mapUser(userRow)) });
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
      await client
        .from("transactions")
        .insert({ user_id: w.userId, type: "payout", amount: payout, bet_id: betId });
    }
  }

  const { data: betRow, error: betErr } = await client
    .from("bets")
    .update({ status: "resolved", outcome })
    .eq("id", betId)
    .select()
    .single();
  if (betErr) throw new Error(betErr.message);
  setState({ bets: upsertById(state.bets, mapBet(betRow)) });
}

export async function voidBet(betId: string): Promise<void> {
  const client = requireClient();
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet) throw new Error("Bet not found");

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
    await client
      .from("transactions")
      .insert({ user_id: w.userId, type: "refund", amount: w.amount, bet_id: betId });
  }

  const { data: betRow, error: betErr } = await client
    .from("bets")
    .update({ status: "void" })
    .eq("id", betId)
    .select()
    .single();
  if (betErr) throw new Error(betErr.message);
  setState({ bets: upsertById(state.bets, mapBet(betRow)) });
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
    await client
      .from("transactions")
      .insert({ user_id: w.userId, type: "refund", amount: w.amount, bet_id: betId });
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
    await client
      .from("transactions")
      .insert({ user_id: w.userId, type: "refund", amount: -w.payout, bet_id: betId });

    const { data: wagerRow, error: wagerErr } = await client
      .from("wagers")
      .update({ payout: null })
      .eq("id", w.id)
      .select()
      .single();
    if (!wagerErr) setState({ wagers: upsertById(state.wagers, mapWager(wagerRow)) });
  }

  const { data: lockedRow, error: lockErr } = await client
    .from("bets")
    .update({ status: "locked", outcome: null })
    .eq("id", betId)
    .select()
    .single();
  if (lockErr) throw new Error(lockErr.message);
  setState({ bets: upsertById(state.bets, mapBet(lockedRow)) });

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
