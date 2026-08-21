import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import {
  MIN_WAGER,
  addComment,
  betTotals,
  deleteBet,
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
import { ShareButton } from "../components/ShareButton";
import { CATEGORY_EMOJI } from "../lib/categories";
import type { Side } from "../types";

export function BetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const state = useStoreState();
  const user = useCurrentUser();

  // null = no explicit choice yet — defaults to whichever side the user is
  // already on, instead of always starting the toggle at YES regardless of
  // an existing position.
  const [sideOverride, setSideOverride] = useState<Side | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolvingEarly, setResolvingEarly] = useState(false);

  const bet = state.bets.find((b) => b.id === id);
  if (!bet) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-(--color-ink-soft)">Bet not found.</p>
        <Link to="/" className="mt-3 inline-block text-sm font-medium text-(--color-yes-text)">
          Back to feed
        </Link>
      </div>
    );
  }

  const status = effectiveStatus(bet);
  const { yes, no, total, wagers } = betTotals(bet.id);
  const subject = bet.subjectUserId ? state.users.find((u) => u.id === bet.subjectUserId) : null;
  const subjectName = subject?.name ?? bet.subjectName;
  const creator = state.users.find((u) => u.id === bet.creatorId);
  const position = user ? userPosition(bet.id, user.id) : null;
  const side: Side = sideOverride ?? position?.side ?? "yes";

  async function submitWager(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    try {
      await placeWager(bet!.id, user.id, side, amt);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleResolve(outcome: Side) {
    try {
      await resolveBet(bet!.id, outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleReResolve(outcome: Side) {
    try {
      await reResolve(bet!.id, outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleFlagDispute() {
    try {
      await flagDispute(bet!.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    try {
      await deleteBet(bet!.id, user.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!user || !commentText.trim()) return;
    const text = commentText;
    setCommentText("");
    try {
      await addComment(bet!.id, user.id, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const comments = state.comments
    .filter((c) => c.betId === bet.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          {user?.id === bet.creatorId && (status === "open" || status === "locked") && (
            <>
              {confirmingDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-(--color-ink-soft)">Delete this bet?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-full bg-(--color-no-text) px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="text-xs font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-(--color-ink-soft) transition hover:bg-(--color-no-soft) hover:text-(--color-no-text)"
                >
                  Delete
                </button>
              )}
            </>
          )}
          <ShareButton url={`${window.location.origin}/bets/${bet.id}`} title={bet.title} />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-(--color-no-soft) px-4 py-2.5 text-sm text-(--color-no-text)">{error}</p>
      )}

      <div className="mt-4 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {subjectName && (
              <Avatar
                name={subjectName}
                emoji={subject?.avatarEmoji}
                color={subject?.avatarColor}
                size="md"
              />
            )}
            <div>
              <h1 className="font-display text-xl font-semibold leading-snug text-(--color-ink)">
                {bet.title}
              </h1>
              <p className="text-xs text-(--color-ink-soft)">
                {CATEGORY_EMOJI[bet.category]} {bet.category} ·{" "}
                {subjectName ? `about ${subjectName} · ` : ""}created by {creator?.name ?? "?"}
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
            {wagers.length > 0 && ` · ${wagers.length} ${wagers.length === 1 ? "person" : "people"} in`}
          </p>
        </div>

        {status === "resolved" && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium text-(--color-ink) ${
              bet.outcome === "yes" ? "bg-(--color-yes-soft)" : "bg-(--color-no-soft)"
            }`}
          >
            Resolved:{" "}
            <span
              className={`uppercase ${bet.outcome === "yes" ? "text-(--color-yes-text)" : "text-(--color-no-text)"}`}
            >
              {bet.outcome}
            </span>{" "}
            won
          </div>
        )}
        {status === "void" && (
          <div className="mt-4 rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-(--color-ink)">
            Void — all stakes refunded
          </div>
        )}

        {(status === "resolved" || status === "void") && user && !bet.disputed && (
          <button
            onClick={() => handleFlagDispute()}
            className="mt-3 text-xs font-medium text-(--color-ink-soft) underline decoration-dotted hover:text-(--color-no-text)"
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
                  className="flex-1 rounded-xl bg-(--color-yes-soft) py-3 font-display text-sm font-semibold text-(--color-yes-text) transition hover:opacity-80"
                >
                  Re-resolve YES
                </button>
                <button
                  onClick={() => handleReResolve("no")}
                  className="flex-1 rounded-xl bg-(--color-no-soft) py-3 font-display text-sm font-semibold text-(--color-no-text) transition hover:opacity-80"
                >
                  Re-resolve NO
                </button>
              </div>
            )}
          </div>
        )}

        {status === "open" && user && user.id === bet.subjectUserId && (
          <p className="mt-6 border-t border-black/5 pt-5 text-sm text-(--color-ink-soft)">
            You're the subject of this bet, so you can't wager on it.
          </p>
        )}

        {status === "open" && user && user.id !== bet.subjectUserId && (
          <form onSubmit={submitWager} className="mt-6 border-t border-black/5 pt-5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSideOverride("yes")}
                className={`flex-1 rounded-xl py-3 font-display text-sm font-semibold transition ${
                  side === "yes"
                    ? "bg-(--color-yes-text) text-white"
                    : "bg-(--color-yes-soft) text-(--color-yes-text)"
                }`}
              >
                YES
              </button>
              <button
                type="button"
                onClick={() => setSideOverride("no")}
                className={`flex-1 rounded-xl py-3 font-display text-sm font-semibold transition ${
                  side === "no" ? "bg-(--color-no-text) text-white" : "bg-(--color-no-soft) text-(--color-no-text)"
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
                step="any"
                inputMode="numeric"
                placeholder={`Min ${MIN_WAGER}`}
                className="flex-1 rounded-xl border border-black/10 bg-(--color-bg) px-3 py-3 font-mono text-sm outline-none focus:border-(--color-yes-text)"
              />
              <button
                type="submit"
                className="rounded-xl bg-(--color-ink) px-5 py-3 font-display text-sm font-semibold text-white transition hover:opacity-90"
              >
                Wager
              </button>
            </div>
            {(Number(amount) > 0 || position) &&
              (() => {
                const amt = Number(amount) || 0;
                const currentSideTotal = side === "yes" ? yes : no;
                const otherSideTotal = side === "yes" ? no : yes;
                const otherSide = side === "yes" ? "NO" : "YES";
                const existingOnSide = position && position.side === side ? position.amount : 0;
                const yourStakeOnSide = existingOnSide + amt;
                const newSideTotal = currentSideTotal + amt;

                const potentialPayout =
                  otherSideTotal > 0
                    ? yourStakeOnSide + (yourStakeOnSide / newSideTotal) * otherSideTotal
                    : null;
                const profit = potentialPayout !== null ? potentialPayout - yourStakeOnSide : null;

                return (
                  <div className="mt-2 space-y-1 text-xs text-(--color-ink-soft)">
                    {amt > 0 && (
                      <p>
                        You're risking{" "}
                        <span className="font-mono font-medium text-(--color-no-text)">{amt}</span> tokens
                        — gone for good if {otherSide} wins.
                      </p>
                    )}
                    {existingOnSide > 0 && (
                      <p>
                        You already have {existingOnSide} tokens on {side.toUpperCase()}
                        {amt > 0 ? " — this adds to it." : "."}
                      </p>
                    )}
                    {potentialPayout !== null ? (
                      <p>
                        If {side.toUpperCase()} wins: you'd get back{" "}
                        <span className="font-mono font-medium text-(--color-yes-text)">
                          {Math.round(potentialPayout)}
                        </span>{" "}
                        tokens{yourStakeOnSide !== amt ? " total" : ""} (+{Math.round(profit!)} profit) at
                        today's odds — this shifts as more people bet.
                      </p>
                    ) : (
                      <p>
                        No one's on {otherSide} yet — if it stays that way, this voids and just refunds
                        your stake instead of paying out.
                      </p>
                    )}
                  </div>
                );
              })()}
          </form>
        )}

        {status === "open" && user && (
          <div className="mt-4 border-t border-black/5 pt-4">
            {resolvingEarly ? (
              <div>
                <p className="text-sm font-medium text-(--color-ink)">
                  Resolve now? This ends betting immediately, even though the timer hasn't run out.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleResolve("yes")}
                    className="flex-1 rounded-xl bg-(--color-yes-soft) py-3 font-display text-sm font-semibold text-(--color-yes-text) transition hover:opacity-80"
                  >
                    Resolve YES
                  </button>
                  <button
                    onClick={() => handleResolve("no")}
                    className="flex-1 rounded-xl bg-(--color-no-soft) py-3 font-display text-sm font-semibold text-(--color-no-text) transition hover:opacity-80"
                  >
                    Resolve NO
                  </button>
                </div>
                <button
                  onClick={() => setResolvingEarly(false)}
                  className="mt-2 text-xs font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setResolvingEarly(true)}
                className="text-xs font-medium text-(--color-ink-soft) underline decoration-dotted hover:text-(--color-ink)"
              >
                Already know the outcome? Resolve early
              </button>
            )}
          </div>
        )}

        {status === "locked" && user && (
          <div className="mt-6 border-t border-black/5 pt-5">
            <p className="text-sm font-medium text-(--color-ink)">
              Locked. Once the real outcome is known, anyone can resolve it (honor system).
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleResolve("yes")}
                className="flex-1 rounded-xl bg-(--color-yes-soft) py-3 font-display text-sm font-semibold text-(--color-yes-text) transition hover:opacity-80"
              >
                Resolve YES
              </button>
              <button
                onClick={() => handleResolve("no")}
                className="flex-1 rounded-xl bg-(--color-no-soft) py-3 font-display text-sm font-semibold text-(--color-no-text) transition hover:opacity-80"
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

            // Near-miss framing: only claim it was close when the losing
            // side genuinely held a meaningful share of the pool — a real
            // 15% loss framed as "so close" would just be dishonest.
            let nearMiss: string | null = null;
            if (w.payout === 0 && bet.status === "resolved" && total > 0) {
              const losingTotal = bet.outcome === "yes" ? no : yes;
              const share = Math.round((losingTotal / total) * 100);
              if (share >= 35) {
                nearMiss = `So close — ${w.side.toUpperCase()} had ${share}% of the pool`;
              }
            }

            return (
              <div key={w.id} className="rounded-xl bg-(--color-surface) px-4 py-3 shadow-sm shadow-black/5">
                <div className="flex items-center justify-between">
                  <Link to={bettor ? `/profile/${bettor.id}` : "#"} className="flex items-center gap-2.5">
                    <Avatar name={bettor?.name ?? "?"} emoji={bettor?.avatarEmoji} color={bettor?.avatarColor} />
                    <span className="text-sm font-medium text-(--color-ink)">{bettor?.name}</span>
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-(--color-ink)">{w.amount}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        w.side === "yes"
                          ? "bg-(--color-yes-soft) text-(--color-yes-text)"
                          : "bg-(--color-no-soft) text-(--color-no-text)"
                      }`}
                    >
                      {w.side.toUpperCase()}
                    </span>
                    {w.payout !== null && (
                      <span className="font-mono text-xs text-(--color-ink-soft)">→ {Math.round(w.payout)}</span>
                    )}
                  </div>
                </div>
                {nearMiss && <p className="mt-1.5 pl-9 text-xs text-(--color-no-text)">{nearMiss}</p>}
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
                <Link to={author ? `/profile/${author.id}` : "#"}>
                  <Avatar name={author?.name ?? "?"} emoji={author?.avatarEmoji} color={author?.avatarColor} />
                </Link>
                <div>
                  <p className="text-sm text-(--color-ink)">
                    <Link to={author ? `/profile/${author.id}` : "#"} className="font-medium hover:underline">
                      {author?.name}
                    </Link>{" "}
                    {c.text}
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
              className="flex-1 rounded-xl border border-black/10 bg-(--color-surface) px-3 py-2.5 text-sm outline-none focus:border-(--color-yes-text)"
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
