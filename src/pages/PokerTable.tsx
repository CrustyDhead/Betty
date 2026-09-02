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
import type { PlayingCard } from "../types";

const POLL_MS = 1_500;

// Visual slots around the oval, clockwise starting at bottom-center — the
// viewer's own seat always gets rotated into slot 0 so "you" are always at
// the bottom, same convention WSOP and every other poker app use.
const SEAT_POSITIONS = [
  { top: "90%", left: "50%" },
  { top: "70%", left: "91%" },
  { top: "16%", left: "84%" },
  { top: "2%", left: "50%" },
  { top: "16%", left: "16%" },
  { top: "70%", left: "9%" },
];

const RESULT_COPY: Record<string, { label: string; className: string }> = {
  won: { label: "Won", className: "text-(--color-yes-text)" },
  split: { label: "Split", className: "text-(--color-ink-soft)" },
  lost: { label: "Lost", className: "text-(--color-no-text)" },
  folded: { label: "Folded", className: "text-(--color-ink-soft)" },
};

const ACTION_LABEL: Record<string, string> = {
  blind: "Blind",
  fold: "Fold",
  check: "Check",
  call: "Call",
  raise: "Raise",
  all_in: "All-in",
};

function MiniCard({ card, faceDown, empty, big }: { card?: PlayingCard; faceDown?: boolean; empty?: boolean; big?: boolean }) {
  const dims = big ? "h-16 w-11 text-sm" : "h-10 w-7 text-[10px]";
  if (empty) {
    return <div className={`${dims} rounded-md border border-dashed border-black/10`} />;
  }
  if (faceDown || !card) {
    return (
      <div className={`flex ${dims} items-center justify-center rounded-md bg-(--color-ink) text-white shadow-sm`}>
        🂠
      </div>
    );
  }
  return (
    <div
      className={`flex ${dims} items-center justify-center rounded-md border border-black/10 bg-white font-semibold shadow-sm ${
        card.suit === "♥" || card.suit === "♦" ? "text-(--color-no-text)" : "text-(--color-ink)"
      }`}
    >
      {formatCard(card)}
    </div>
  );
}

// A ring around the avatar that visibly drains as the turn timer runs out
// — WSOP-style urgency, not just a small text countdown easy to miss.
function TurnRing({ fraction, size = 52 }: { fraction: number; size?: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-bg)" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={clamped < 0.3 ? "var(--color-no-text)" : "var(--color-yes-text)"}
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.2s linear" }}
      />
    </svg>
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
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    pollPokerTable().catch(() => {});
    const id = setInterval(() => {
      pollPokerTable().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

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

  const anchor = mySeat ? mySeat.seatIndex : 0;
  const seatAt = (realIndex: number) => state.pokerTableSeats.find((s) => s.seatIndex === realIndex) ?? null;
  const isMyTurn = table.currentSeatIndex !== null && mySeat?.seatIndex === table.currentSeatIndex;
  const turnFraction = table.turnEndsAt
    ? Math.max(0, (new Date(table.turnEndsAt).getTime() - now) / POKER_TURN_MS)
    : 0;
  const turnSecondsLeft = table.turnEndsAt
    ? Math.max(0, Math.ceil((new Date(table.turnEndsAt).getTime() - now) / 1000))
    : null;
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
  const effectiveRaiseTo = Math.max(minRaiseTo, Math.min(maxRaiseTo, raiseTo ?? minRaiseTo));
  const halfPotRaiseTo = Math.max(minRaiseTo, Math.min(maxRaiseTo, table.currentBet + Math.round(table.pot / 2)));
  const potRaiseTo = Math.max(minRaiseTo, Math.min(maxRaiseTo, table.currentBet + table.pot));

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
      await raisePokerSeat(mySeat.id, Math.round(amount));
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
            <strong>Raise</strong>. Watch the ring around your avatar — it drains as your {POKER_TURN_MS / 1000}s to
            act runs out, then you're auto-folded (or auto-checked if that's free).
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

      {error && (
        <p className="mt-3 rounded-xl bg-(--color-no-soft) px-4 py-3 text-center text-sm text-(--color-no-text)">
          {error}
        </p>
      )}

      <div className="relative mx-auto mt-4 aspect-[4/5] w-full max-w-xs rounded-[50%] border border-black/10 bg-(--color-surface) shadow-sm shadow-black/5 sm:aspect-[3/2] sm:max-w-none">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
          <p className="font-mono text-xs text-(--color-ink-soft)">Pot: {Math.round(table.pot).toLocaleString()}</p>
          <div className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => table.communityCards[i]).map((c, i) => (
              <MiniCard key={i} card={c} empty={!c} />
            ))}
          </div>
          <p className="font-display text-xs font-semibold text-(--color-ink)">
            {!occupied && "Sit down to start"}
            {occupied && table.status === "waiting" && (eligibleWaiting < 2 ? "Waiting for players…" : "Starting…")}
            {occupied &&
              (table.status === "preflop" || table.status === "flop" || table.status === "turn" || table.status === "river") &&
              (isMyTurn ? "Your turn" : "")}
            {occupied && table.status === "showdown" && "Showdown!"}
            {occupied &&
              table.status === "hand_over" &&
              (state.pokerTableSeats.filter((s) => s.status === "active" || s.status === "all_in").length <= 1
                ? "Hand over"
                : "Showdown!")}
          </p>
        </div>

        {SEAT_POSITIONS.map((pos, visualIndex) => {
          const realIndex = (anchor + visualIndex) % POKER_SEATS;
          const seat = seatAt(realIndex);
          const player = seat ? state.users.find((u) => u.id === seat.userId) : null;
          const isMe = seat?.userId === user.id;
          const isCurrentTurn = table.currentSeatIndex === realIndex;
          const isButton = table.buttonSeatIndex === realIndex;
          const result = seat?.result ? RESULT_COPY[seat.result] : null;
          const inHand = seat?.status === "active" || seat?.status === "all_in";
          const showFaceDown = inHand && !isMe && !seat?.revealedHoleCards;

          return (
            <div
              key={visualIndex}
              className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ top: pos.top, left: pos.left }}
            >
              {!seat ? (
                <button
                  type="button"
                  disabled={busy || !!mySeat}
                  onClick={() => handleJoin(realIndex)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-black/15 text-[10px] font-medium text-(--color-ink-soft) transition hover:border-(--color-ink) hover:text-(--color-ink) disabled:opacity-40"
                >
                  Sit
                </button>
              ) : (
                <>
                  <div className={`relative h-[52px] w-[52px] ${seat.status === "folded" ? "opacity-40" : ""}`}>
                    {isCurrentTurn && <TurnRing fraction={turnFraction} size={52} />}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Avatar name={player?.name ?? "?"} emoji={player?.avatarEmoji} color={player?.avatarColor} size="md" />
                    </div>
                    {isButton && (
                      <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-(--color-ink) text-[9px] font-bold text-white">
                        D
                      </span>
                    )}
                  </div>
                  <p className="max-w-20 truncate text-center text-[10px] font-medium text-(--color-ink)">
                    {player?.name ?? "?"}
                    {isMe && " (you)"}
                  </p>
                  {seat.status !== "seated" && (
                    <span className="rounded-full bg-(--color-bg) px-1.5 py-0.5 font-mono text-[10px] font-semibold text-(--color-ink)">
                      {Math.round(seat.handCommitted)}
                    </span>
                  )}
                  {inHand && (
                    <div className="flex gap-0.5">
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
                  {seat.status === "all_in" && (
                    <p className="text-[9px] font-semibold text-(--color-no-text)">All-in</p>
                  )}
                  {seat.lastAction && seat.status === "active" && !result && (
                    <p className="text-[9px] text-(--color-ink-soft)">{ACTION_LABEL[seat.lastAction] ?? seat.lastAction}</p>
                  )}
                  {result && (
                    <p className={`text-[10px] font-semibold ${result.className}`}>
                      {result.label}
                      {seat.resultAmount !== null && seat.resultAmount !== 0 && (
                        <> {seat.resultAmount > 0 ? `+${Math.round(seat.resultAmount)}` : Math.round(seat.resultAmount)}</>
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {mySeat && isMyTurn && turnSecondsLeft !== null && (
        <p className="mt-2 text-center text-xs text-(--color-ink-soft)">{turnSecondsLeft}s to act</p>
      )}

      {isMyTurn && mySeat && (
        <div className="mt-4 space-y-2 rounded-2xl bg-(--color-surface) p-3 shadow-sm shadow-black/5">
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={handleFold}
              className="flex-1 rounded-lg bg-(--color-bg) py-2.5 text-sm font-semibold text-(--color-ink) transition hover:opacity-90 disabled:opacity-60"
            >
              Fold
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleCheckCall}
              className="flex-1 rounded-lg bg-(--color-ink) py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {callAmount > 0 ? `Call ${callAmount}` : "Check"}
            </button>
          </div>
          {maxRaiseTo > table.currentBet && (
            <>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRaiseTo(minRaiseTo)}
                  className="flex-1 rounded-lg bg-(--color-bg) py-1.5 text-xs font-medium text-(--color-ink) disabled:opacity-60"
                >
                  Min
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRaiseTo(halfPotRaiseTo)}
                  className="flex-1 rounded-lg bg-(--color-bg) py-1.5 text-xs font-medium text-(--color-ink) disabled:opacity-60"
                >
                  ½ Pot
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRaiseTo(potRaiseTo)}
                  className="flex-1 rounded-lg bg-(--color-bg) py-1.5 text-xs font-medium text-(--color-ink) disabled:opacity-60"
                >
                  Pot
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRaiseTo(maxRaiseTo)}
                  className="flex-1 rounded-lg bg-(--color-bg) py-1.5 text-xs font-medium text-(--color-ink) disabled:opacity-60"
                >
                  All-in
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRaiseTo(Math.max(minRaiseTo, effectiveRaiseTo - POKER_BIG_BLIND))}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--color-bg) text-sm font-bold text-(--color-ink) disabled:opacity-60"
                >
                  −
                </button>
                <span className="flex-1 rounded-lg bg-(--color-bg) py-1.5 text-center font-mono text-sm font-semibold text-(--color-ink)">
                  {effectiveRaiseTo}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRaiseTo(Math.min(maxRaiseTo, effectiveRaiseTo + POKER_BIG_BLIND))}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--color-bg) text-sm font-bold text-(--color-ink) disabled:opacity-60"
                >
                  +
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRaise(effectiveRaiseTo)}
                  className="rounded-lg bg-(--color-yes-text) px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  Raise
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mySeat && mySeat.status === "seated" && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-(--color-surface) p-3 shadow-sm shadow-black/5">
          <span className="text-xs text-(--color-ink-soft)">
            {user.tokenBalance < POKER_BIG_BLIND
              ? `Need ${POKER_BIG_BLIND} tokens to play`
              : "Seated — waiting for the next hand"}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={handleLeave}
            className="text-xs font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
          >
            Leave table
          </button>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-(--color-ink-soft)">
        Blinds {POKER_SMALL_BLIND}/{POKER_BIG_BLIND} · no side pots (every hand caps at the smallest stack dealt in)
      </p>
    </div>
  );
}
