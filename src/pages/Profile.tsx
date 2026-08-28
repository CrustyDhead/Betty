import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  ENGAGEMENT_TIERS,
  LAUNCH_DATE,
  LOAN_CAP,
  LOAN_INTEREST_RATE,
  LOAN_MIN,
  WEEKLY_STIPEND,
  activeLoanFor,
  borrowTokens,
  currentStreak,
  logout,
  nextStipendAt,
  notificationPermission,
  projectedStipend,
  renameUser,
  repayLoan,
  requestNotificationPermission,
  setAvatarColor,
  setAvatarEmoji,
  transferTokens,
  userTransactions,
  userWinStats,
} from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { Avatar } from "../components/Avatar";
import { AVATAR_COLOR_OPTIONS, AVATAR_EMOJI_OPTIONS, DEFAULT_AVATAR_COLOR } from "../lib/avatars";
import type { Transaction, TransactionType } from "../types";

const TRANSACTION_LABEL: Record<TransactionType, { emoji: string; label: string }> = {
  stipend: { emoji: "💰", label: "Weekly stipend" },
  wager: { emoji: "🎲", label: "Wager" },
  payout: { emoji: "🏆", label: "Payout" },
  refund: { emoji: "↩️", label: "Refund" },
  transfer: { emoji: "🔄", label: "Transfer" },
  roulette: { emoji: "🎰", label: "Roulette" },
  loan: { emoji: "🏦", label: "Loan" },
  repayment: { emoji: "🧾", label: "Loan repayment" },
  adjustment: { emoji: "⚖️", label: "Balance adjustment" },
};

const TIER_EMOJI: Record<string, string> = {
  quiet: "💤",
  steady: "💰",
  active: "✨",
  on_fire: "🔥",
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const currentUser = useCurrentUser();
  const state = useStoreState();
  const viewedUser = userId ? state.users.find((u) => u.id === userId) : currentUser;
  const isOwn = !!currentUser && !!viewedUser && viewedUser.id === currentUser.id;

  const [tab, setTab] = useState<"profile" | "token" | "settings">("profile");
  const effectiveTab = tab === "settings" && !isOwn ? "profile" : tab;

  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSuccess, setRenameSuccess] = useState<string | null>(null);

  const [savingEmoji, setSavingEmoji] = useState<string | null>(null);
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const [savingColor, setSavingColor] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState(notificationPermission());
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [borrowAmount, setBorrowAmount] = useState("");
  const [borrowError, setBorrowError] = useState<string | null>(null);
  const [borrowing, setBorrowing] = useState(false);
  const [repayError, setRepayError] = useState<string | null>(null);
  const [repaying, setRepaying] = useState(false);

  async function handleEnableNotifications() {
    setNotifPermission(await requestNotificationPermission());
  }

  if (!currentUser) return null;
  if (!viewedUser) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-(--color-ink-soft)">User not found.</p>
      </div>
    );
  }

  const { settledCount, wins, losses } = userWinStats(viewedUser.id);
  const winRate = settledCount > 0 ? Math.round((wins / settledCount) * 100) : null;
  const streak = currentStreak(viewedUser.id);
  const transactions = userTransactions(viewedUser.id);
  const stipend = projectedStipend(viewedUser.id);
  const nextStipendDate = nextStipendAt(viewedUser.id);
  const loan = activeLoanFor(viewedUser.id);

  const badges: { label: string; emoji: string }[] = [];
  if (streak.kind === "win" && streak.streak >= 2) {
    badges.push({ label: `${streak.streak} correct calls in a row`, emoji: "🔥" });
  }
  if (wins >= 5) {
    badges.push({ label: `${wins} lifetime wins`, emoji: "🏆" });
  }
  if (viewedUser.tokenBalance >= 2000) {
    badges.push({ label: "Whale — 2,000+ tokens", emoji: "🐋" });
  }

  function transactionContext(t: Transaction): string | null {
    if (t.type === "transfer" && t.counterpartyUserId) {
      const other = state.users.find((u) => u.id === t.counterpartyUserId)?.name ?? "someone";
      return t.amount < 0 ? `to ${other}` : `from ${other}`;
    }
    if (t.betId) {
      const bet = state.bets.find((b) => b.id === t.betId);
      if (bet) return bet.title;
    }
    return null;
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setRenameError(null);
    setRenameSuccess(null);
    if (!newName.trim()) {
      setRenameError("Enter a name");
      return;
    }
    setRenaming(true);
    try {
      await renameUser(currentUser.id, newName);
      setRenameSuccess("Name updated.");
      setNewName("");
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRenaming(false);
    }
  }

  async function handlePickEmoji(emoji: string | null) {
    if (!currentUser) return;
    setSavingEmoji(emoji ?? "__reset__");
    setEmojiError(null);
    try {
      await setAvatarEmoji(currentUser.id, emoji);
    } catch (err) {
      setEmojiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingEmoji(null);
    }
  }

  async function handlePickColor(color: string | null) {
    if (!currentUser) return;
    setSavingColor(color ?? "__reset__");
    setColorError(null);
    try {
      await setAvatarColor(currentUser.id, color);
    } catch (err) {
      setColorError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingColor(null);
    }
  }

  async function handleTransfer(e: FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setTransferError(null);
    setTransferSuccess(null);
    const amt = Number(transferAmount);
    if (!transferTo) {
      setTransferError("Pick who you're sending to");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setTransferError("Enter a positive amount");
      return;
    }
    setSending(true);
    try {
      await transferTokens(currentUser.id, transferTo, amt);
      const recipientName = state.users.find((u) => u.id === transferTo)?.name ?? "them";
      setTransferSuccess(`Sent ${amt} tokens to ${recipientName}.`);
      setTransferAmount("");
      setTransferTo("");
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  async function handleBorrow(e: FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setBorrowError(null);
    const amt = Number(borrowAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setBorrowError("Enter a positive amount");
      return;
    }
    setBorrowing(true);
    try {
      await borrowTokens(currentUser.id, amt);
      setBorrowAmount("");
    } catch (err) {
      setBorrowError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBorrowing(false);
    }
  }

  async function handleRepay() {
    if (!currentUser) return;
    setRepayError(null);
    setRepaying(true);
    try {
      await repayLoan(currentUser.id);
    } catch (err) {
      setRepayError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRepaying(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">
        {isOwn ? "Profile" : `${viewedUser.name}'s profile`}
      </h1>

      <div className="mt-5 flex items-center gap-4 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5">
        <Avatar name={viewedUser.name} emoji={viewedUser.avatarEmoji} color={viewedUser.avatarColor} size="md" />
        <div>
          <p className="font-display text-lg font-semibold text-(--color-ink)">{viewedUser.name}</p>
          <p className="font-mono text-sm text-(--color-ink-soft)">
            {Math.round(viewedUser.tokenBalance).toLocaleString()} tokens
          </p>
        </div>
        {!isOwn && (
          <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-(--color-ink-soft)">
            👁 View only
          </span>
        )}
      </div>

      <div className="mt-5 flex gap-1 rounded-full bg-gray-100 p-1">
        <button
          onClick={() => setTab("profile")}
          className={`flex-1 rounded-full py-2 font-display text-sm font-semibold transition ${
            effectiveTab === "profile" ? "bg-(--color-surface) text-(--color-ink) shadow-sm" : "text-(--color-ink-soft)"
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setTab("token")}
          className={`flex-1 rounded-full py-2 font-display text-sm font-semibold transition ${
            effectiveTab === "token" ? "bg-(--color-surface) text-(--color-ink) shadow-sm" : "text-(--color-ink-soft)"
          }`}
        >
          Token
        </button>
        {isOwn && (
          <button
            onClick={() => setTab("settings")}
            className={`flex-1 rounded-full py-2 font-display text-sm font-semibold transition ${
              effectiveTab === "settings" ? "bg-(--color-surface) text-(--color-ink) shadow-sm" : "text-(--color-ink-soft)"
            }`}
          >
            Settings
          </button>
        )}
      </div>

      {effectiveTab === "token" && (
        <div className="mt-5">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Weekly stipend
          </h2>
          <div className="mt-3 rounded-2xl bg-(--color-surface) p-4 shadow-sm shadow-black/5">
            {stipend.kind === "flat" ? (
              <>
                <p className="text-sm font-medium text-(--color-ink)">
                  🎉 First-week bonus — flat {WEEKLY_STIPEND} tokens for everyone through{" "}
                  {formatDate(LAUNCH_DATE + 7 * 24 * 60 * 60 * 1000)}
                </p>
                <p className="mt-1.5 text-xs text-(--color-ink-soft)">
                  After that, the weekly stipend scales with how many wagers{" "}
                  {isOwn ? "you place" : `${viewedUser.name} places`} in the past 7 days — more action, bigger
                  top-up.
                </p>
                {nextStipendDate !== null && (
                  <p className="mt-1.5 text-xs text-(--color-ink-soft)">
                    Next payout: {formatDate(nextStipendDate)}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-(--color-ink)">
                      {TIER_EMOJI[stipend.kind]} {stipend.tier?.label}
                    </p>
                    <p className="text-xs text-(--color-ink-soft)">
                      {stipend.wagerCount} wager{stipend.wagerCount === 1 ? "" : "s"} in the last 7 days
                    </p>
                    {nextStipendDate !== null && (
                      <p className="mt-1 text-xs text-(--color-ink-soft)">
                        Next payout: {formatDate(nextStipendDate)}
                      </p>
                    )}
                  </div>
                  <p className="text-right font-mono text-lg font-semibold text-(--color-ink)">
                    +{stipend.amount}
                    <span className="block text-xs font-normal text-(--color-ink-soft)">next week</span>
                  </p>
                </div>
                <div className="mt-3 space-y-1">
                  {ENGAGEMENT_TIERS.map((t) => (
                    <div
                      key={t.kind}
                      className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs ${
                        t.kind === stipend.tier?.kind
                          ? "bg-(--color-yes-soft) font-medium text-(--color-yes-text)"
                          : "text-(--color-ink-soft)"
                      }`}
                    >
                      <span>
                        {t.label} ({t.minWagers}+ wager{t.minWagers === 1 ? "" : "s"})
                      </span>
                      <span className="font-mono">{t.amount}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Loan
          </h2>
          <div className="mt-3 rounded-2xl bg-(--color-surface) p-4 shadow-sm shadow-black/5">
            {loan ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-(--color-ink)">
                      {loan.status === "overdue" ? "⚠️ Overdue" : "🏦 Active loan"}
                    </p>
                    <p className="text-xs text-(--color-ink-soft)">
                      Borrowed {Math.round(loan.principal)} at {Math.round(loan.interestRate * 100)}% interest
                    </p>
                  </div>
                  <p className="text-right font-mono text-lg font-semibold text-(--color-no-text)">
                    {Math.round(loan.amountOwed)}
                    <span className="block text-xs font-normal text-(--color-ink-soft)">owed</span>
                  </p>
                </div>
                <p className="mt-2 text-xs text-(--color-ink-soft)">
                  {loan.status === "overdue"
                    ? "Past due — blocks new loans until paid off."
                    : `Due ${formatDate(new Date(loan.dueAt).getTime())}`}
                </p>
                {isOwn && (
                  <>
                    <button
                      onClick={handleRepay}
                      disabled={repaying || currentUser.tokenBalance < loan.amountOwed}
                      className="mt-3 w-full rounded-xl bg-(--color-ink) py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      {repaying ? "…" : `Repay ${Math.round(loan.amountOwed)}`}
                    </button>
                    {currentUser.tokenBalance < loan.amountOwed && (
                      <p className="mt-1.5 text-xs text-(--color-no-text)">
                        Not enough tokens to repay in full yet.
                      </p>
                    )}
                    {repayError && <p className="mt-1.5 text-xs text-(--color-no-text)">{repayError}</p>}
                  </>
                )}
              </>
            ) : isOwn ? (
              <form onSubmit={handleBorrow}>
                <p className="text-xs text-(--color-ink-soft)">
                  Borrow up to {LOAN_CAP} tokens at {Math.round(LOAN_INTEREST_RATE * 100)}% flat interest, due
                  in 7 days.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    type="number"
                    step="any"
                    inputMode="numeric"
                    placeholder={`${LOAN_MIN}–${LOAN_CAP}`}
                    className="flex-1 rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 font-mono text-sm outline-none focus:border-(--color-yes-text)"
                  />
                  <button
                    type="submit"
                    disabled={borrowing}
                    className="rounded-xl bg-(--color-ink) px-4 py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {borrowing ? "…" : "Borrow"}
                  </button>
                </div>
                {borrowError && <p className="mt-2 text-sm text-(--color-no-text)">{borrowError}</p>}
              </form>
            ) : (
              <p className="text-sm text-(--color-ink-soft)">No active loan.</p>
            )}
          </div>

          {isOwn && (
            <>
              <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
                Send tokens
              </h2>
              {state.users.filter((u) => u.id !== currentUser.id).length === 0 ? (
                <p className="mt-3 text-sm text-(--color-ink-soft)">No one else has joined yet.</p>
              ) : (
                <form
                  onSubmit={handleTransfer}
                  className="mt-3 rounded-2xl bg-(--color-surface) p-4 shadow-sm shadow-black/5"
                >
                  <div className="flex gap-2">
                    <select
                      value={transferTo}
                      onChange={(e) => setTransferTo(e.target.value)}
                      className="flex-1 rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
                    >
                      <option value="">Who to?</option>
                      {state.users
                        .filter((u) => u.id !== currentUser.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                    <input
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      type="number"
                      step="any"
                      inputMode="numeric"
                      placeholder="Amount"
                      className="w-28 rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 font-mono text-sm outline-none focus:border-(--color-yes-text)"
                    />
                    <button
                      type="submit"
                      disabled={sending}
                      className="rounded-xl bg-(--color-ink) px-4 py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      {sending ? "…" : "Send"}
                    </button>
                  </div>
                  {transferError && <p className="mt-2 text-sm text-(--color-no-text)">{transferError}</p>}
                  {transferSuccess && <p className="mt-2 text-sm text-(--color-yes-text)">{transferSuccess}</p>}
                </form>
              )}
            </>
          )}

          <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Statement
          </h2>
          {transactions.length === 0 ? (
            <p className="mt-3 text-sm text-(--color-ink-soft)">No token activity yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {transactions.map((t) => {
                const meta = TRANSACTION_LABEL[t.type];
                const context = transactionContext(t);
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-xl bg-(--color-surface) px-4 py-3 shadow-sm shadow-black/5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{meta.emoji}</span>
                      <div>
                        <p className="text-sm font-medium text-(--color-ink)">
                          {meta.label}
                          {context && <span className="text-(--color-ink-soft)"> · {context}</span>}
                        </p>
                        <p className="text-xs text-(--color-ink-soft)">{formatTimestamp(t.timestamp)}</p>
                      </div>
                    </div>
                    <span
                      className={`font-mono text-sm font-semibold ${
                        t.amount > 0
                          ? "text-(--color-yes-text)"
                          : t.amount < 0
                            ? "text-(--color-no-text)"
                            : "text-(--color-ink-soft)"
                      }`}
                    >
                      {t.amount > 0 ? "+" : ""}
                      {Math.round(t.amount).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {effectiveTab === "profile" && (
        <div className="mt-5">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Win rate
          </h2>
          {winRate !== null ? (
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-(--color-surface) p-4 shadow-sm shadow-black/5">
              <div>
                <p className="font-mono text-2xl font-semibold text-(--color-ink)">{winRate}%</p>
                <p className="text-xs text-(--color-ink-soft)">
                  {wins} win{wins === 1 ? "" : "s"} of {settledCount} settled
                </p>
              </div>
              {streak.kind === "win" && streak.streak >= 2 && (
                <span
                  className="rounded-full bg-(--color-yes-soft) px-2.5 py-1 text-xs font-semibold text-(--color-yes-text)"
                  title={`${streak.streak} correct calls in a row`}
                >
                  🔥 {streak.streak} streak
                </span>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-(--color-ink-soft)">No settled bets yet.</p>
          )}

          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
              <p className="font-mono text-lg font-semibold text-(--color-ink)">{settledCount}</p>
              <p className="text-xs text-(--color-ink-soft)">Settled</p>
            </div>
            <div className="rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
              <p className="font-mono text-lg font-semibold text-(--color-yes-text)">{wins}</p>
              <p className="text-xs text-(--color-ink-soft)">Wins</p>
            </div>
            <div className="rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
              <p className="font-mono text-lg font-semibold text-(--color-no-text)">{losses}</p>
              <p className="text-xs text-(--color-ink-soft)">Losses</p>
            </div>
          </div>

          <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Badges
          </h2>
          {badges.length === 0 ? (
            <p className="mt-3 text-sm text-(--color-ink-soft)">
              None yet — win a couple bets in a row to unlock some.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={b.label}
                  className="rounded-full bg-(--color-surface) px-3 py-1.5 text-sm font-medium text-(--color-ink) shadow-sm shadow-black/5"
                >
                  {b.emoji} {b.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {effectiveTab === "settings" && isOwn && (
        <div className="mt-5">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Name
          </h2>
          <form
            onSubmit={handleRename}
            className="mt-3 flex gap-2 rounded-2xl bg-(--color-surface) p-4 shadow-sm shadow-black/5"
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={currentUser.name}
              className="flex-1 rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
            />
            <button
              type="submit"
              disabled={renaming}
              className="rounded-xl bg-(--color-ink) px-4 py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {renaming ? "…" : "Save"}
            </button>
          </form>
          {renameError && <p className="mt-2 text-sm text-(--color-no-text)">{renameError}</p>}
          {renameSuccess && <p className="mt-2 text-sm text-(--color-yes-text)">{renameSuccess}</p>}
          <p className="mt-2 text-xs text-(--color-ink-soft)">
            You'll need to use the new name to log in next time — this doesn't affect your current session.
          </p>

          <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Avatar
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => handlePickEmoji(null)}
              disabled={savingEmoji !== null}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition disabled:opacity-50 ${
                !currentUser.avatarEmoji
                  ? "border-(--color-ink) bg-(--color-ink) text-white"
                  : "border-black/10 bg-(--color-surface) text-(--color-ink-soft) hover:text-(--color-ink)"
              }`}
              title="Use initial instead"
            >
              {currentUser.name.trim().charAt(0).toUpperCase() || "?"}
            </button>
            {AVATAR_EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handlePickEmoji(emoji)}
                disabled={savingEmoji !== null}
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg transition disabled:opacity-50 ${
                  currentUser.avatarEmoji === emoji
                    ? "border-(--color-ink) bg-(--color-ink)"
                    : "border-black/10 bg-(--color-surface) hover:border-black/20"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
          {emojiError && <p className="mt-2 text-sm text-(--color-no-text)">{emojiError}</p>}

          <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Avatar color
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {AVATAR_COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                onClick={() => handlePickColor(color)}
                disabled={savingColor !== null}
                className={`flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-offset-2 transition disabled:opacity-50 ${
                  (currentUser.avatarColor ?? DEFAULT_AVATAR_COLOR) === color
                    ? "ring-(--color-ink)"
                    : "ring-transparent"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              >
                {(currentUser.avatarColor ?? DEFAULT_AVATAR_COLOR) === color && (
                  <span className="text-sm text-white">✓</span>
                )}
              </button>
            ))}
          </div>
          {colorError && <p className="mt-2 text-sm text-(--color-no-text)">{colorError}</p>}
        </div>
      )}

      {isOwn && notifPermission !== "unsupported" && (
        <>
          <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Notifications
          </h2>
          {notifPermission === "granted" && (
            <p className="mt-3 text-sm text-(--color-ink-soft)">
              ✅ You'll get notified when a bet you're in resolves.
            </p>
          )}
          {notifPermission === "denied" && (
            <p className="mt-3 text-sm text-(--color-ink-soft)">
              Blocked — enable notifications for this site in your browser settings if you want them.
            </p>
          )}
          {notifPermission === "default" && (
            <button
              onClick={handleEnableNotifications}
              className="mt-3 rounded-xl bg-gray-100 px-4 py-2.5 font-display text-sm font-semibold text-(--color-ink) transition hover:bg-gray-200"
            >
              Notify me when my bets resolve
            </button>
          )}
        </>
      )}

      {isOwn && (
        <button
          onClick={() => logout()}
          className="mt-8 w-full rounded-xl bg-gray-100 py-2.5 font-display text-sm font-semibold text-(--color-ink) transition hover:bg-gray-200"
        >
          Log out
        </button>
      )}
    </div>
  );
}
