import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import {
  MIN_WAGER,
  addComment,
  betTotals,
  effectiveStatus,
  flagDispute,
  placeWager,
  reResolve,
  resolveBet,
  userPosition,
} from "../lib/store";
import { SplitBar } from "../components/SplitBar";
import { Countdown } from "../components/Countdown";
import { Avatar } from "../components/Avatar";
import { CATEGORY_EMOJI } from "../lib/categories";
import type { Side } from "../types";

export function BetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const state = useStoreState();
  const user = useCurrentUser();

  const [side, setSide] = useState<Side>("yes");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

  const bet = state.bets.find((b) => b.id === id);
  if (!bet) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-(--color-ink-soft)">Bet not found.</p>
        <Link to="/" className="mt-3 inline-block text-sm font-medium text-(--color-yes)">
          Back to feed
        </Link>
      </div>
    );
  }

  const status = effectiveStatus(bet);
  const { yes, no, total, wagers } = betTotals(bet.id);
  const subject = bet.subjectUserId ? state.users.find((u) => u.id === bet.subjectUserId) : null;
  const creator = state.users.find((u) => u.id === bet.creatorId);
  const position = user ? userPosition(bet.id, user.id) : null;

  function submitWager(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    try {
      placeWager(bet!.id, user.id, side, amt);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function handleResolve(outcome: Side) {
    resolveBet(bet!.id, outcome);
  }

  function handleReResolve(outcome: Side) {
    reResolve(bet!.id, outcome);
  }

  function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!user || !commentText.trim()) return;
    addComment(bet!.id, user.id, commentText);
    setCommentText("");
  }

  const comments = state.comments
    .filter((c) => c.betId === bet.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button
        onClick={() => navigate(-1)}
        className="text-sm font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
      >
        ← Back
      </button>

      <div className="mt-4 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {subject && <Avatar name={subject.name} size="md" />}
            <div>
              <h1 className="font-display text-xl font-semibold leading-snug text-(--color-ink)">
                {bet.title}
              </h1>
              <p className="text-xs text-(--color-ink-soft)">
                {CATEGORY_EMOJI[bet.category]} {bet.category} ·{" "}
                {subject ? `about ${subject.name} · ` : ""}created by {creator?.name ?? "?"}
              </p>
            </div>
          </div>
          {status === "open" ? (
            <Countdown lockTime={bet.lockTime} />
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 font-mono text-xs font-medium capitalize text-(--color-ink-soft)">
              {status}
            </span>
          )}
        </div>

        {bet.description && <p className="mt-4 text-sm text-(--color-ink)">{bet.description}</p>}

        <div className="mt-6">
          <SplitBar yes={yes} no={no} size="lg" />
          <p className="mt-2 font-mono text-sm text-(--color-ink-soft)">
            {total.toLocaleString()} tokens in the pot
          </p>
        </div>

        {status === "resolved" && (
          <div className="mt-4 rounded-xl bg-(--color-yes-soft) px-4 py-3 text-sm font-medium text-(--color-ink)">
            Resolved: <span className="uppercase text-(--color-yes)">{bet.outcome}</span> won
          </div>
        )}
        {status === "void" && (
          <div className="mt-4 rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-(--color-ink)">
            Void — all stakes refunded
          </div>
        )}

        {(status === "resolved" || status === "void") && user && !bet.disputed && (
          <button
            onClick={() => flagDispute(bet!.id)}
            className="mt-3 text-xs font-medium text-(--color-ink-soft) underline decoration-dotted hover:text-(--color-no)"
          >
            Something's off — flag this resolution
          </button>
        )}

        {bet.disputed && (
          <div className="mt-4 rounded-xl bg-(--color-no-soft) px-4 py-3">
            <p className="text-sm font-medium text-(--color-ink)">
              Flagged as disputed. Anyone can re-resolve — this reverses the previous payout and
              re-applies the new outcome.
            </p>
            {user && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleReResolve("yes")}
                  className="flex-1 rounded-xl bg-(--color-yes-soft) py-2 font-display text-sm font-semibold text-(--color-yes) transition hover:opacity-80"
                >
                  Re-resolve YES
                </button>
                <button
                  onClick={() => handleReResolve("no")}
                  className="flex-1 rounded-xl bg-(--color-no-soft) py-2 font-display text-sm font-semibold text-(--color-no) transition hover:opacity-80"
                >
                  Re-resolve NO
                </button>
              </div>
            )}
          </div>
        )}

        {status === "open" && user && (
          <form onSubmit={submitWager} className="mt-6 border-t border-black/5 pt-5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide("yes")}
                className={`flex-1 rounded-xl py-2.5 font-display text-sm font-semibold transition ${
                  side === "yes"
                    ? "bg-(--color-yes) text-white"
                    : "bg-(--color-yes-soft) text-(--color-yes)"
                }`}
              >
                YES
              </button>
              <button
                type="button"
                onClick={() => setSide("no")}
                className={`flex-1 rounded-xl py-2.5 font-display text-sm font-semibold transition ${
                  side === "no" ? "bg-(--color-no) text-white" : "bg-(--color-no-soft) text-(--color-no)"
                }`}
              >
                NO
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min={MIN_WAGER}
                placeholder={`Min ${MIN_WAGER}`}
                className="flex-1 rounded-xl border border-black/10 bg-(--color-bg) px-3 py-2.5 font-mono text-sm outline-none focus:border-(--color-yes)"
              />
              <button
                type="submit"
                className="rounded-xl bg-(--color-ink) px-5 py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90"
              >
                Wager
              </button>
            </div>
            {position && (
              <p className="mt-2 text-xs text-(--color-ink-soft)">
                You already have {position.amount} tokens on {position.side.toUpperCase()} — this adds
                to it.
              </p>
            )}
            {error && <p className="mt-2 text-sm text-(--color-no)">{error}</p>}
          </form>
        )}

        {status === "locked" && user && (
          <div className="mt-6 border-t border-black/5 pt-5">
            <p className="text-sm font-medium text-(--color-ink)">
              Locked. Once the real outcome is known, anyone can resolve it (honor system).
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleResolve("yes")}
                className="flex-1 rounded-xl bg-(--color-yes-soft) py-2.5 font-display text-sm font-semibold text-(--color-yes) transition hover:opacity-80"
              >
                Resolve YES
              </button>
              <button
                onClick={() => handleResolve("no")}
                className="flex-1 rounded-xl bg-(--color-no-soft) py-2.5 font-display text-sm font-semibold text-(--color-no) transition hover:opacity-80"
              >
                Resolve NO
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
          Who's in
        </h2>
        <div className="mt-3 space-y-2">
          {wagers.length === 0 && (
            <p className="text-sm text-(--color-ink-soft)">No wagers yet — be the first.</p>
          )}
          {wagers.map((w) => {
            const bettor = state.users.find((u) => u.id === w.userId);
            return (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-xl bg-(--color-surface) px-4 py-3 shadow-sm shadow-black/5"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={bettor?.name ?? "?"} />
                  <span className="text-sm font-medium text-(--color-ink)">{bettor?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-(--color-ink)">{w.amount}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      w.side === "yes"
                        ? "bg-(--color-yes-soft) text-(--color-yes)"
                        : "bg-(--color-no-soft) text-(--color-no)"
                    }`}
                  >
                    {w.side.toUpperCase()}
                  </span>
                  {w.payout !== null && (
                    <span className="font-mono text-xs text-(--color-ink-soft)">→ {Math.round(w.payout)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
          Banter
        </h2>
        <div className="mt-3 space-y-2">
          {comments.length === 0 && (
            <p className="text-sm text-(--color-ink-soft)">No comments yet.</p>
          )}
          {comments.map((c) => {
            const author = state.users.find((u) => u.id === c.userId);
            return (
              <div
                key={c.id}
                className="flex items-start gap-2.5 rounded-xl bg-(--color-surface) px-4 py-3 shadow-sm shadow-black/5"
              >
                <Avatar name={author?.name ?? "?"} />
                <div>
                  <p className="text-sm text-(--color-ink)">
                    <span className="font-medium">{author?.name}</span> {c.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {user && (
          <form onSubmit={submitComment} className="mt-3 flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment"
              className="flex-1 rounded-xl border border-black/10 bg-(--color-surface) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes)"
            />
            <button
              type="submit"
              className="rounded-xl bg-(--color-ink) px-4 py-2.5 font-display text-sm font-semibold text-white transition hover:opacity-90"
            >
              Post
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
