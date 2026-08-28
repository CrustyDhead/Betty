import { useState } from "react";
import { Link } from "react-router-dom";
import { hitBlackjackHand, standBlackjackHand, startBlackjackHand } from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { TogglePill } from "../components/TogglePill";
import { BLACKJACK_MIN_BET, formatCard, handValue } from "../lib/blackjack";
import type { PlayingCard } from "../types";

const CHIP_VALUES = [10, 50, 100, 500] as const;

const OUTCOME_COPY: Record<string, { label: string; className: string }> = {
  win: { label: "You won!", className: "text-(--color-yes-text)" },
  blackjack: { label: "Blackjack! 3:2 payout.", className: "text-(--color-yes-text)" },
  push: { label: "Push — stake back.", className: "text-(--color-ink-soft)" },
  lose: { label: "Dealer wins.", className: "text-(--color-no-text)" },
};

function CardRow({ cards, hideSecond = false }: { cards: PlayingCard[]; hideSecond?: boolean }) {
  return (
    <div className="flex justify-center gap-2">
      {cards.map((c, i) =>
        hideSecond && i === 1 ? (
          <div
            key={i}
            className="flex h-16 w-11 items-center justify-center rounded-lg bg-(--color-ink) text-lg text-white"
          >
            🂠
          </div>
        ) : (
          <div
            key={i}
            className={`flex h-16 w-11 items-center justify-center rounded-lg border border-black/10 bg-white text-sm font-semibold shadow-sm ${
              c.suit === "♥" || c.suit === "♦" ? "text-(--color-no-text)" : "text-(--color-ink)"
            }`}
          >
            {formatCard(c)}
          </div>
        ),
      )}
    </div>
  );
}

export function Blackjack() {
  const user = useCurrentUser();
  const state = useStoreState();

  const [chip, setChip] = useState<(typeof CHIP_VALUES)[number]>(10);
  const [dealing, setDealing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const myHands = state.blackjackHands
    .filter((h) => h.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const hand = myHands[0] ?? null;
  const isLive = hand?.status === "player_turn";

  async function handleDeal() {
    if (!user || dealing) return;
    setError(null);
    setDealing(true);
    try {
      await startBlackjackHand(user.id, chip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDealing(false);
    }
  }

  async function handleHit() {
    if (!hand || acting) return;
    setError(null);
    setActing(true);
    try {
      await hitBlackjackHand(hand.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActing(false);
    }
  }

  async function handleStand() {
    if (!hand || acting) return;
    setError(null);
    setActing(true);
    try {
      await standBlackjackHand(hand.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActing(false);
    }
  }

  const playerTotal = hand ? handValue(hand.playerCards) : null;
  const dealerTotal = hand ? handValue(hand.dealerCards) : null;
  const outcomeCopy = hand?.outcome ? OUTCOME_COPY[hand.outcome] : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/casino" className="text-sm font-medium text-(--color-ink-soft) hover:text-(--color-ink)">
        ← Casino
      </Link>
      <h1 className="mt-2 font-display text-xl font-semibold text-(--color-ink)">Blackjack</h1>

      <div className="mt-4 rounded-2xl bg-(--color-surface) p-6 shadow-sm shadow-black/5">
        {hand ? (
          <>
            <p className="text-center text-xs font-medium uppercase tracking-wide text-(--color-ink-soft)">
              Dealer{" "}
              {!isLive && dealerTotal && (
                <span className="font-mono normal-case">
                  · {dealerTotal.total}
                  {dealerTotal.soft ? " (soft)" : ""}
                </span>
              )}
            </p>
            <div className="mt-2">
              <CardRow cards={hand.dealerCards} hideSecond={isLive} />
            </div>

            <p className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-(--color-ink-soft)">
              You{" "}
              {playerTotal && (
                <span className="font-mono normal-case">
                  · {playerTotal.total}
                  {playerTotal.soft ? " (soft)" : ""}
                </span>
              )}
            </p>
            <div className="mt-2">
              <CardRow cards={hand.playerCards} />
            </div>

            {outcomeCopy && (
              <p className={`mt-4 text-center font-display text-sm font-semibold ${outcomeCopy.className}`}>
                {outcomeCopy.label}
                {hand.payout !== null && hand.payout > 0 && ` +${Math.round(hand.payout - hand.betAmount)} tokens`}
              </p>
            )}

            {error && (
              <p className="mt-4 rounded-xl bg-(--color-no-soft) px-4 py-3 text-center text-sm text-(--color-no-text)">
                {error}
              </p>
            )}

            {isLive ? (
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={handleHit}
                  disabled={acting}
                  className="flex-1 rounded-xl bg-(--color-ink) py-3 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  Hit
                </button>
                <button
                  type="button"
                  onClick={handleStand}
                  disabled={acting}
                  className="flex-1 rounded-xl bg-(--color-bg) py-3 font-display text-sm font-semibold text-(--color-ink) transition hover:opacity-90 disabled:opacity-60"
                >
                  Stand
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDeal}
                disabled={dealing || chip > user.tokenBalance}
                className="mt-5 w-full rounded-xl bg-(--color-ink) py-3 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {dealing ? "Dealing…" : `Deal for ${chip}`}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-center text-sm text-(--color-ink-soft)">Place a bet to deal your hand.</p>
            {error && (
              <p className="mt-3 rounded-xl bg-(--color-no-soft) px-4 py-3 text-center text-sm text-(--color-no-text)">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleDeal}
              disabled={dealing || chip > user.tokenBalance}
              className="mt-4 w-full rounded-xl bg-(--color-ink) py-3 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {dealing ? "Dealing…" : `Deal for ${chip}`}
            </button>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-(--color-surface) p-3 shadow-sm shadow-black/5">
        <span className="text-xs font-medium text-(--color-ink-soft)">Bet</span>
        <div className="flex gap-1.5">
          {CHIP_VALUES.map((v) => (
            <TogglePill key={v} variant="inset" active={chip === v} onClick={() => setChip(v)}>
              <span className="font-mono">x{v}</span>
            </TogglePill>
          ))}
        </div>
        <span className="font-mono text-sm font-semibold text-(--color-ink)">
          {Math.round(user.tokenBalance).toLocaleString()}
        </span>
      </div>

      <p className="mt-3 text-center text-xs text-(--color-ink-soft)">
        Hit or Stand only · dealer stands on all 17s · blackjack pays 3:2 · minimum bet {BLACKJACK_MIN_BET} tokens
      </p>
    </div>
  );
}
