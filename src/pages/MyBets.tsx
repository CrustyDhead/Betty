import { Link } from "react-router-dom";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { effectiveStatus } from "../lib/store";

export function MyBets() {
  const user = useCurrentUser();
  const state = useStoreState();

  if (!user) return null;

  const myWagers = state.wagers.filter((w) => w.userId === user.id);
  const rows = myWagers
    .map((w) => ({ wager: w, bet: state.bets.find((b) => b.id === w.betId)! }))
    .filter((r) => r.bet)
    .sort((a, b) => new Date(b.bet.createdAt).getTime() - new Date(a.bet.createdAt).getTime());

  const settled = rows.filter((r) => r.wager.payout !== null);
  const netPL = settled.reduce((sum, r) => sum + (r.wager.payout! - r.wager.amount), 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">My Bets</h1>

      <div className="mt-4 flex gap-3">
        <div className="flex-1 rounded-2xl bg-(--color-surface) p-4 shadow-sm shadow-black/5">
          <p className="text-xs text-(--color-ink-soft)">Balance</p>
          <p className="mt-1 font-mono text-lg font-semibold text-(--color-ink)">
            {Math.round(user.tokenBalance).toLocaleString()}
          </p>
        </div>
        <div className="flex-1 rounded-2xl bg-(--color-surface) p-4 shadow-sm shadow-black/5">
          <p className="text-xs text-(--color-ink-soft)">Net P/L (settled)</p>
          <p
            className={`mt-1 font-mono text-lg font-semibold ${
              netPL > 0 ? "text-(--color-yes-text)" : netPL < 0 ? "text-(--color-no-text)" : "text-(--color-ink)"
            }`}
          >
            {netPL > 0 ? "+" : ""}
            {Math.round(netPL).toLocaleString()}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-(--color-ink-soft)">
          No wagers yet.{" "}
          <Link to="/" className="font-medium text-(--color-yes-text)">
            Find a bet
          </Link>
        </p>
      ) : (
        <div className="mt-5 space-y-2">
          {rows.map(({ wager, bet }) => {
            const status = effectiveStatus(bet);
            const pl = wager.payout !== null ? wager.payout - wager.amount : null;
            return (
              <Link
                key={wager.id}
                to={`/bets/${bet.id}`}
                className="flex items-center justify-between rounded-xl bg-(--color-surface) px-4 py-3 shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div>
                  <p className="text-sm font-medium text-(--color-ink)">{bet.title}</p>
                  <p className="mt-0.5 text-xs capitalize text-(--color-ink-soft)">{status}</p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-mono text-sm font-medium ${
                      wager.side === "yes" ? "text-(--color-yes-text)" : "text-(--color-no-text)"
                    }`}
                  >
                    {wager.amount} {wager.side.toUpperCase()}
                  </p>
                  {pl !== null && (
                    <p
                      className={`font-mono text-xs ${
                        pl > 0 ? "text-(--color-yes-text)" : pl < 0 ? "text-(--color-no-text)" : "text-(--color-ink-soft)"
                      }`}
                    >
                      {pl > 0 ? "+" : ""}
                      {Math.round(pl)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
