import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  autoFoldPokerSeatIfDue,
  checkOrCallPokerSeat,
  ensureNextPokerHand,
  ensurePokerTable,
  fetchMyHoleCards,
  foldPokerSeat,
  joinPokerTable,
  leavePokerTable,
  nudgePokerTableIfStale,
  pollPokerTable,
  raisePokerSeat,
  startPokerHandIfDue,
} from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { Avatar } from "../components/Avatar";
import { HelpButton, HelpModal } from "../components/HelpModal";
import {
  POKER_BIG_BLIND,
  POKER_HAND_OVER_PAUSE_MS,
  POKER_SEATS,
  POKER_SMALL_BLIND,
  POKER_TURN_MS,
  formatCard,
} from "../lib/poker";
import type { PokerTableSeat, PlayingCard } from "../types";

const POLL_MS = 1_500;

const RESULT_COPY: Record<string, { label: string; className: string }> = {
  won: { label: "Won", className: "text-(--color-yes-text)" },
  split: { label: "Split", className: "text-(--color-ink-soft)" },
  lost: { label: "Lost", className: "text-(--color-no-text)" },
  folded: { label: "Folded", className: "text-(--color-ink-soft)" },
};

function MiniCard({ card, faceDown }: { card?: PlayingCard; faceDown?: boolean }) {
  if (faceDown || !card) {
    return (
      <div className="flex h-11 w-8 items-center justify-center rounded-md bg-(--color-ink) text-xs text-white shadow-sm">
        🂠
      </div>
    );
  }
  return (
    <div
      className={`flex h-11 w-8 items-center justify-center rounded-md border border-black/10 bg-white text-xs font-semibold shadow-sm ${
        card.suit === "♥" || card.suit === "♦" ? "text-(--color-no-text)" : "text-(--color-ink)"
      }`}
    >
      {formatCard(card)}
    </div>
  );
}

export function PokerTable() {
  const user = useCurrentUser();
  const state = useStoreState();
  const table = state.pokerTable;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [handOverAt, setHandOverAt] = useState<{ tableId: string; handNumber: number; at: number } | null>(null);
  const [myHoleCards, setMyHoleCards] = useState<PlayingCard[] | null>(null);
  const [myHoleCardsHand, setMyHoleCardsHand] = useState<number | null>(null);
  const [raiseTo, setRaiseTo] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const mySeat = user ? (state.pokerTableSeats.find((s) => s.userId === user.id) ?? null) : null;
  const occupied = state.pokerTableSeats.length > 0;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    pollPokerTable().catch(() => {});
    const id = setInterval(() => {
      pollPokerTable().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Auto-leave on navigating away — same as Blackjack Table.
  const mySeatRef = useRef(mySeat);
  useEffect(() => {
    mySeatRef.current = mySeat;
  }, [mySeat]);
  useEffect(() => {
    return () => {
      const seat = mySeatRef.current;
      if (seat && seat.status === "seated") leavePokerTable(seat.id).catch(() => {});
    };
  }, []);

  // Fetch (and cache per-hand) just this player's own hole cards.
  useEffect(() => {
    if (!user || !mySeat || !table) return;
    if (mySeat.status === "seated") {
      if (myHoleCards !== null) setMyHoleCards(null);
      return;
    }
    if (myHoleCardsHand === table.handNumber) return;
    fetchMyHoleCards(mySeat.id, user.id).then((cards) => {
      setMyHoleCards(cards);
      setMyHoleCardsHand(table.handNumber);
    });
  }, [user, mySeat, table, myHoleCards, myHoleCardsHand]);

  // Phase engine — same client-driven pattern as Blackjack Table.
  useEffect(() => {
    if (!table) {
      ensurePokerTable().catch(() => {});
      return;
    }
    if (!occupied) return;

    if (table.status === "waiting") {
      startPokerHandIfDue(table).catch(() => {});
      return;
    }
    if (table.status === "preflop" || table.status === "flop" || table.status === "turn" || table.status === "river") {
      nudgePokerTableIfStale(table).catch(() => {});
      autoFoldPokerSeatIfDue(table).catch(() => {});
      return;
    }
    if (table.status === "hand_over") {
      if (handOverAt?.tableId !== table.id || handOverAt.handNumber !== table.handNumber) {
        setHandOverAt({ tableId: table.id, handNumber: table.handNumber, at: now });
        return;
      }
      if (now - handOverAt.at >= POKER_HAND_OVER_PAUSE_MS) {
        ensureNextPokerHand(table).catch(() => {});
      }
    }
  }, [table, now, handOverAt, occupied]);

  if (!user) return null;
  if (!table) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-(--color-ink-soft)">
        Opening the table…
      </div>
    );
  }

  const seats: (PokerTableSeat | null)[] = Array.from(
    { length: POKER_SEATS },
    (_, i) => state.pokerTableSeats.find((s) => s.seatIndex === i) ?? null,
  );
  const isMyTurn = table.currentSeatIndex !== null && mySeat?.seatIndex === table.currentSeatIndex;
  const turnSecondsLeft = table.turnEndsAt
    ? Math.max(0, Math.ceil((new Date(table.turnEndsAt).getTime() - now) / 1000))
    : null;
  const inHandCount = state.pokerTableSeats.filter((s) => s.status === "active" || s.status === "all_in").length;
  const eligibleWaiting =
    table.status === "waiting"
      ? state.pokerTableSeats.filter((s) => {
          if (s.status !== "seated") return false;
          const u = state.users.find((x) => x.id === s.userId);
          return !!u && u.tokenBalance >= POKER_BIG_BLIND;
        }).length
      : 0;

  const callAmount = mySeat && isMyTurn ? Math.max(0, table.currentBet - mySeat.streetCommitted) : 0;
  const maxAdditional = mySeat ? Math.max(0, (table.handCap ?? Infinity) - mySeat.handCommitted) : 0;
  const maxRaiseTo = mySeat ? mySeat.streetCommitted + maxAdditional : 0;
  const minRaiseTo = Math.min(table.currentBet + table.minRaise, maxRaiseTo);
  const effectiveRaiseTo = raiseTo ?? minRaiseTo;

  async function handleJoin(seatIndex: number) {
    if (!user || busy || mySeat) return;
    setError(null);
    setBusy(true);
    try {
      await joinPokerTable(table!.id, user.id, seatIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (!mySeat || busy) return;
    setError(null);
    setBusy(true);
    try {
      await leavePokerTable(mySeat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleFold() {
    if (!mySeat || busy) return;
    setError(null);
    setBusy(true);
    try {
      await foldPokerSeat(mySeat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckCall() {
    if (!mySeat || busy) return;
    setError(null);
    setBusy(true);
    try {
      await checkOrCallPokerSeat(mySeat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleRaise(amount: number) {
    if (!mySeat || busy) return;
    setError(null);
    setBusy(true);
    try {
      await raisePokerSeat(mySeat.id, amount);
      setRaiseTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/casino" className="text-sm font-medium text-(--color-ink-soft) hover:text-(--color-ink)">
        ← Casino
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <h1 className="font-display text-xl font-semibold text-(--color-ink)">Poker</h1>
        <HelpButton onClick={() => setShowHelp(true)} />
      </div>

      {showHelp && (
        <HelpModal title="How to play Poker" onClose={() => setShowHelp(false)}>
          <p>
            Texas Hold'em, up to {POKER_SEATS} players. Everyone gets 2 private hole cards; 5 shared community cards
            (flop, turn, river) get revealed over 4 betting rounds. Best 5-card hand from your 2 + the 5 shared cards
            wins the pot.
          </p>
          <p>
            Blinds are {POKER_SMALL_BLIND}/{POKER_BIG_BLIND} tokens, posted automatically by the two seats after the
            dealer button each hand — the button rotates every hand. On your turn: <strong>Fold</strong> (give up the
            hand), <strong>Check/Call</strong> (match the current bet, free if no one's bet yet), or{" "}
            <strong>Raise</strong>. {POKER_TURN_MS / 1000}s to act before you're auto-folded (or auto-checked if
            that's free).
          </p>
          <p>
            <strong>No side pots:</strong> every hand caps everyone's total betting at whoever has the smallest
            balance among the players dealt in that hand — so no one can ever be forced all-in for less than someone
            else's bet.
          </p>
          <p className="text-(--color-ink-soft)">
            If everyone else folds, the last player standing wins the pot without showing their cards. Otherwise it's
            a showdown — every hand still in reveals, best hand (or hands, split on a tie) takes the pot.
          </p>
        </HelpModal>
      )}

      <div className="mt-4 rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
        <p className="font-mono text-xs text-(--color-ink-soft)">Pot: {Math.round(table.pot).toLocaleString()}</p>
        <div className="mt-2 flex justify-center gap-1.5">
          {Array.from({ length: 5 }, (_, i) => table.communityCards[i]).map((c, i) => (
            <MiniCard key={i} card={c} />
          ))}
        </div>

        <p className="mt-3 font-display text-sm font-semibold text-(--color-ink)">
          {!occupied && "Table's empty — sit down to start a game"}
          {occupied && table.status === "waiting" &&
            (eligibleWaiting < 2 ? "Waiting for another player…" : "Starting a hand…")}
          {occupied &&
            (table.status === "preflop" || table.status === "flop" || table.status === "turn" || table.status === "river") &&
            (isMyTurn ? `Your turn${turnSecondsLeft !== null ? ` · ${turnSecondsLeft}s` : ""}` : "Players acting…")}
          {occupied && table.status === "showdown" && "Showdown!"}
          {occupied && table.status === "hand_over" && (inHandCount <= 1 ? "Hand over" : "Showdown!")}
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-(--color-no-soft) px-4 py-3 text-center text-sm text-(--color-no-text)">
          {error}
        </p>
      )}

      {mySeat && mySeat.status === "active" && myHoleCards && (
        <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl bg-(--color-surface) p-3 shadow-sm shadow-black/5">
          <span className="text-xs font-medium text-(--color-ink-soft)">Your hand</span>
          <div className="flex gap-1.5">
            {myHoleCards.map((c, i) => (
              <MiniCard key={i} card={c} />
            ))}
          </div>
        </div>
      )}

      {isMyTurn && mySeat && (
        <div className="mt-4 space-y-2 rounded-2xl bg-(--color-surface) p-3 shadow-sm shadow-black/5">
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={handleFold}
              className="flex-1 rounded-lg bg-(--color-bg) py-2 text-xs font-semibold text-(--color-ink) transition hover:opacity-90 disabled:opacity-60"
            >
              Fold
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleCheckCall}
              className="flex-1 rounded-lg bg-(--color-ink) py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {callAmount > 0 ? `Call ${callAmount}` : "Check"}
            </button>
          </div>
          {maxRaiseTo > table.currentBet && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={minRaiseTo}
                max={maxRaiseTo}
                value={effectiveRaiseTo}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
                className="w-24 rounded-lg border border-black/10 bg-(--color-bg) px-2 py-1.5 text-xs outline-none focus:border-(--color-yes-text)"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRaise(effectiveRaiseTo)}
                className="flex-1 rounded-lg bg-(--color-yes-text) py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                Raise to {effectiveRaiseTo}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRaise(maxRaiseTo)}
                className="rounded-lg bg-(--color-bg) px-3 py-2 text-xs font-semibold text-(--color-ink) transition hover:opacity-90 disabled:opacity-60"
              >
                All-in
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {seats.map((seat, i) => {
          const player = seat ? state.users.find((u) => u.id === seat.userId) : null;
          const isMe = seat?.userId === user.id;
          const isCurrentTurn = table.currentSeatIndex === i;
          const isButton = table.buttonSeatIndex === i;
          const result = seat?.result ? RESULT_COPY[seat.result] : null;
          const inHand = seat?.status === "active" || seat?.status === "all_in";
          const showFaceDown = inHand && !isMe && !seat?.revealedHoleCards;

          return (
            <div
              key={i}
              className={`rounded-xl bg-(--color-surface) p-3 shadow-sm shadow-black/5 ${
                isCurrentTurn ? "ring-2 ring-(--color-ink)" : ""
              } ${seat?.status === "folded" ? "opacity-50" : ""}`}
            >
              {!seat ? (
                <button
                  type="button"
                  disabled={busy || !!mySeat}
                  onClick={() => handleJoin(i)}
                  className="flex h-full w-full items-center justify-center rounded-lg py-4 text-xs font-medium text-(--color-ink-soft) transition hover:text-(--color-ink) disabled:opacity-50"
                >
                  {mySeat ? "Empty seat" : "Sit here"}
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar name={player?.name ?? "?"} emoji={player?.avatarEmoji} color={player?.avatarColor} />
                      <span className="text-xs font-medium text-(--color-ink)">
                        {player?.name ?? "?"}
                        {isMe && " (you)"}
                        {isButton && " 🔘"}
                      </span>
                    </div>
                    {seat.status !== "seated" && (
                      <span className="font-mono text-xs font-semibold text-(--color-ink)">
                        {Math.round(seat.handCommitted)}
                      </span>
                    )}
                  </div>

                  {inHand && (
                    <div className="mt-2 flex justify-center gap-1">
                      {showFaceDown ? (
                        <>
                          <MiniCard faceDown />
                          <MiniCard faceDown />
                        </>
                      ) : isMe ? (
                        (myHoleCards ?? []).map((c, ci) => <MiniCard key={ci} card={c} />)
                      ) : (
                        (seat.revealedHoleCards ?? []).map((c, ci) => <MiniCard key={ci} card={c} />)
                      )}
                    </div>
                  )}

                  {seat.status === "folded" && !result && (
                    <p className="mt-1 text-center text-xs font-semibold text-(--color-ink-soft)">Folded</p>
                  )}
                  {seat.status === "all_in" && (
                    <p className="mt-1 text-center text-xs font-semibold text-(--color-no-text)">All-in</p>
                  )}
                  {seat.lastAction && seat.status === "active" && (
                    <p className="mt-1 text-center text-xs text-(--color-ink-soft)">{seat.lastAction}</p>
                  )}

                  {result && (
                    <p className={`mt-1 text-center text-xs font-semibold ${result.className}`}>
                      {result.label}
                      {seat.resultAmount !== null && seat.resultAmount !== 0 && (
                        <> {seat.resultAmount > 0 ? `+${Math.round(seat.resultAmount)}` : Math.round(seat.resultAmount)}</>
                      )}
                    </p>
                  )}

                  {isMe && seat.status === "seated" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleLeave}
                      className="mt-2 w-full text-center text-[11px] text-(--color-ink-soft) hover:text-(--color-ink)"
                    >
                      Leave table
                    </button>
                  )}
                  {isMe && seat.status === "seated" && player && player.tokenBalance < POKER_BIG_BLIND && (
                    <p className="mt-1 text-center text-[11px] text-(--color-no-text)">
                      Need {POKER_BIG_BLIND} tokens to play
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-xs text-(--color-ink-soft)">
        Blinds {POKER_SMALL_BLIND}/{POKER_BIG_BLIND} · no side pots (every hand caps at the smallest stack dealt in)
      </p>
    </div>
  );
}
