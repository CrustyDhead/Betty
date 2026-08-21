import { currentStreak, logout } from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { Avatar } from "../components/Avatar";

export function Profile() {
  const user = useCurrentUser();
  const state = useStoreState();

  if (!user) return null;

  const settled = state.wagers.filter((w) => w.userId === user.id && w.payout !== null);
  const wins = settled.filter((w) => w.payout! > w.amount).length;
  const losses = settled.length - wins;
  const winRate = settled.length > 0 ? Math.round((wins / settled.length) * 100) : null;
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">Profile</h1>

      <div className="mt-5 flex items-center gap-4 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5">
        <Avatar name={user.name} size="md" />
        <div>
          <p className="font-display text-lg font-semibold text-(--color-ink)">{user.name}</p>
          <p className="font-mono text-sm text-(--color-ink-soft)">
            {user.tokenBalance.toLocaleString()} tokens
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
          <p className="font-mono text-lg font-semibold text-(--color-ink)">{settled.length}</p>
          <p className="text-xs text-(--color-ink-soft)">Settled</p>
        </div>
        <div className="rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
          <p className="font-mono text-lg font-semibold text-(--color-yes)">{wins}</p>
          <p className="text-xs text-(--color-ink-soft)">Wins</p>
        </div>
        <div className="rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
          <p className="font-mono text-lg font-semibold text-(--color-no)">{losses}</p>
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

      <button
        onClick={() => logout()}
        className="mt-8 w-full rounded-xl bg-gray-100 py-2.5 font-display text-sm font-semibold text-(--color-ink) transition hover:bg-gray-200"
      >
        Log out
      </button>
    </div>
  );
}
