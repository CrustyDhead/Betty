import { Link } from "react-router-dom";
import { currentStreak, userWinStats } from "../lib/store";
import { useStoreState } from "../lib/useStore";
import { Avatar } from "../components/Avatar";

export function Leaderboard() {
  const state = useStoreState();

  const rows = state.users
    .map((user) => {
      const { settledCount, wins } = userWinStats(user.id);
      const winRate = settledCount > 0 ? Math.round((wins / settledCount) * 100) : null;
      return { user, winRate, settledCount, streak: currentStreak(user.id) };
    })
    .sort((a, b) => b.user.tokenBalance - a.user.tokenBalance);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">Leaderboard</h1>

      <div className="mt-5 space-y-2">
        {rows.map((row, i) => (
          <Link
            key={row.user.id}
            to={`/profile/${row.user.id}`}
            className="flex items-center gap-3 rounded-xl bg-(--color-surface) px-4 py-3 shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="w-5 text-center font-display text-sm font-semibold text-(--color-ink-soft)">
              {i + 1}
            </span>
            <Avatar name={row.user.name} emoji={row.user.avatarEmoji} color={row.user.avatarColor} />
            <div className="flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-(--color-ink)">
                {row.user.name}
                {row.streak.kind === "win" && row.streak.streak >= 2 && (
                  <span
                    className="rounded-full bg-(--color-yes-soft) px-2 py-0.5 text-xs font-semibold text-(--color-yes-text)"
                    title={`${row.streak.streak} correct calls in a row`}
                  >
                    🔥 {row.streak.streak}
                  </span>
                )}
              </p>
              <p className="text-xs text-(--color-ink-soft)">
                {row.winRate !== null ? `${row.winRate}% win rate · ${row.settledCount} settled` : "No settled bets yet"}
              </p>
            </div>
            <span className="font-mono text-sm font-semibold text-(--color-ink)">
              {Math.round(row.user.tokenBalance).toLocaleString()}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
