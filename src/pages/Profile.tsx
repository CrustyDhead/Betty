import { useState } from "react";
import {
  currentStreak,
  logout,
  notificationPermission,
  requestNotificationPermission,
  setAvatarEmoji,
  userWinStats,
} from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { Avatar } from "../components/Avatar";
import { AVATAR_EMOJI_OPTIONS } from "../lib/avatars";

export function Profile() {
  const user = useCurrentUser();
  useStoreState();
  const [savingEmoji, setSavingEmoji] = useState<string | null>(null);
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState(notificationPermission());

  async function handleEnableNotifications() {
    setNotifPermission(await requestNotificationPermission());
  }

  if (!user) return null;

  const { settledCount, wins, losses } = userWinStats(user.id);
  const winRate = settledCount > 0 ? Math.round((wins / settledCount) * 100) : null;
  const streak = currentStreak(user.id);

  const badges: { label: string; emoji: string }[] = [];
  if (streak.kind === "win" && streak.streak >= 2) {
    badges.push({ label: `${streak.streak} correct calls in a row`, emoji: "🔥" });
  }
  if (wins >= 5) {
    badges.push({ label: `${wins} lifetime wins`, emoji: "🏆" });
  }
  if (user.tokenBalance >= 2000) {
    badges.push({ label: "Whale — 2,000+ tokens", emoji: "🐋" });
  }

  async function handlePickEmoji(emoji: string | null) {
    if (!user) return;
    setSavingEmoji(emoji ?? "__reset__");
    setEmojiError(null);
    try {
      await setAvatarEmoji(user.id, emoji);
    } catch (err) {
      setEmojiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingEmoji(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">Profile</h1>

      <div className="mt-5 flex items-center gap-4 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5">
        <Avatar name={user.name} emoji={user.avatarEmoji} size="md" />
        <div>
          <p className="font-display text-lg font-semibold text-(--color-ink)">{user.name}</p>
          <p className="font-mono text-sm text-(--color-ink-soft)">
            {user.tokenBalance.toLocaleString()} tokens
          </p>
        </div>
      </div>

      <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
        Avatar
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => handlePickEmoji(null)}
          disabled={savingEmoji !== null}
          className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition disabled:opacity-50 ${
            !user.avatarEmoji
              ? "border-(--color-ink) bg-(--color-ink) text-white"
              : "border-black/10 bg-(--color-surface) text-(--color-ink-soft) hover:text-(--color-ink)"
          }`}
          title="Use initial instead"
        >
          {user.name.trim().charAt(0).toUpperCase() || "?"}
        </button>
        {AVATAR_EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handlePickEmoji(emoji)}
            disabled={savingEmoji !== null}
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg transition disabled:opacity-50 ${
              user.avatarEmoji === emoji
                ? "border-(--color-ink) bg-(--color-ink)"
                : "border-black/10 bg-(--color-surface) hover:border-black/20"
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
      {emojiError && <p className="mt-2 text-sm text-(--color-no-text)">{emojiError}</p>}

      <div className="mt-4 grid grid-cols-3 gap-3">
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

      {winRate !== null && (
        <p className="mt-3 text-center text-sm text-(--color-ink-soft)">{winRate}% win rate</p>
      )}

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

      {notifPermission !== "unsupported" && (
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

      <button
        onClick={() => logout()}
        className="mt-8 w-full rounded-xl bg-gray-100 py-2.5 font-display text-sm font-semibold text-(--color-ink) transition hover:bg-gray-200"
      >
        Log out
      </button>
    </div>
  );
}
