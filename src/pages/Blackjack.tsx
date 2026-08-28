import { useState } from "react";
import { Link } from "react-router-dom";
import { hitBlackjackHand, standBlackjackHand, startBlackjackHand } from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { TogglePill } from "../components/TogglePill";
import { Avatar } from "../components/Avatar";
import { HelpButton, HelpModal } from "../components/HelpModal";
import { BLACKJACK_MIN_BET, formatCard, handValue } from "../lib/blackjack";
import type { BlackjackHand, PlayingCard } from "../types";

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
  const [showHelp, setShowHelp] = useState(false);

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

  // One entry per other player — their most recent hand, so this reads as
  // "who's at the table right now" rather than a full history dump.
  const otherHandsByUser = new Map<string, BlackjackHand>();
  for (const h of state.blackjackHands) {
    if (h.userId === user.id) continue;
    const existing = otherHandsByUser.get(h.userId);
    if (!existing || new Date(h.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      otherHandsByUser.set(h.userId, h);
    }
  }
  const otherHands = [...otherHandsByUser.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/casino" className="text-sm font-medium text-(--color-ink-soft) hover:text-(--color-ink)">
        ← Casino
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl font-semibold text-(--color-ink)">Blackjack</h1>
          <HelpButton onClick={() => setShowHelp(true)} />
        </div>
        <Link
          to="/casino/blackjack/table"
          className="text-xs font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
        >
          Play with others →
        </Link>
      </div>

      {showHelp && (
        <HelpModal title="How to play Blackjack" onClose={() => setShowHelp(false)}>
          <p>
            Bet, get dealt 2 cards, and try to beat the dealer's hand without going over 21. Number cards count face
            value, J/Q/K count 10, Aces count 11 or 1 (whichever keeps you under 21).
          </p>
          <p>
            <strong>Hit</strong> to take another card, <strong>Stand</strong> to stop and let the dealer play. The
            dealer draws until reaching 17 or more, then stops (stands on all 17s, including soft 17).
          </p>
          <p>
            <strong>Blackjack</strong> (an Ace + a 10-value card on your first 2 cards) pays 3:2 — bet 10, get back
            25. A normal win pays 2x (even money). Going over 21 (bust) loses immediately, even if the dealer busts
            too. A tie is a push — you get your stake back.
          </p>
          <p className="text-(--color-ink-soft)">
            Infinite shoe — every card drawn has the same odds every time, no card counting. Minimum bet{" "}
            {BLACKJACK_MIN_BET} tokens.
          </p>
        </HelpModal>
      )}

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

      {otherHands.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Around the table
          </h2>
          <div className="mt-2 space-y-1.5">
            {otherHands.map((h) => {
              const player = state.users.find((u) => u.id === h.userId);
              const net = h.payout !== null ? h.payout - h.betAmount : null;
              return (
                <div
                  key={h.userId}
                  className="flex items-center justify-between rounded-lg bg-(--color-surface) px-3 py-2 text-xs shadow-sm shadow-black/5"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={player?.name ?? "?"} emoji={player?.avatarEmoji} color={player?.avatarColor} />
                    <span className="font-medium text-(--color-ink)">{player?.name ?? "?"}</span>
                  </div>
                  {h.status === "player_turn" ? (
                    <span className="text-(--color-ink-soft)">🎲 playing…</span>
                  ) : (
                    <span
                      className={`font-mono font-medium ${
                        net! > 0 ? "text-(--color-yes-text)" : net! < 0 ? "text-(--color-no-text)" : "text-(--color-ink-soft)"
                      }`}
                    >
                      {net! > 0 ? `+${Math.round(net!)}` : Math.round(net!)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
