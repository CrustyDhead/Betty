import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  autoStandBlackjackTableSeatIfDue,
  closeBlackjackTableBettingIfDue,
  ensureBlackjackTable,
  ensureNextBlackjackRound,
  hitBlackjackTableSeat,
  joinBlackjackTable,
  leaveBlackjackTable,
  nudgeBlackjackTableIfStale,
  placeBlackjackTableBet,
  pollBlackjackTable,
  standBlackjackTableSeat,
} from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { TogglePill } from "../components/TogglePill";
import { Avatar } from "../components/Avatar";
import { HelpButton, HelpModal } from "../components/HelpModal";
import { BLACKJACK_MIN_BET, BLACKJACK_TABLE_SEATS, BLACKJACK_TABLE_TURN_MS, formatCard, handValue } from "../lib/blackjack";
import type { BlackjackTableSeat, PlayingCard } from "../types";

const CHIP_VALUES = [10, 50, 100, 500] as const;
const POLL_MS = 1_500;
const RESULT_PAUSE_MS = 4_000;

const OUTCOME_COPY: Record<string, { label: string; className: string }> = {
  win: { label: "Won", className: "text-(--color-yes-text)" },
  blackjack: { label: "Blackjack!", className: "text-(--color-yes-text)" },
  push: { label: "Push", className: "text-(--color-ink-soft)" },
  lose: { label: "Lost", className: "text-(--color-no-text)" },
};

function MiniCardRow({ cards }: { cards: PlayingCard[] }) {
  return (
    <div className="flex justify-center gap-1">
      {cards.map((c, i) => (
        <div
          key={i}
          className={`flex h-11 w-8 items-center justify-center rounded-md border border-black/10 bg-white text-xs font-semibold shadow-sm ${
            c.suit === "♥" || c.suit === "♦" ? "text-(--color-no-text)" : "text-(--color-ink)"
          }`}
        >
          {formatCard(c)}
        </div>
      ))}
    </div>
  );
}

export function BlackjackTable() {
  const user = useCurrentUser();
  const state = useStoreState();
  const table = state.blackjackTable;

  const [chip, setChip] = useState<(typeof CHIP_VALUES)[number]>(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [resolvedAt, setResolvedAt] = useState<{ tableId: string; at: number } | null>(null);

  const mySeat = user ? (state.blackjackTableSeats.find((s) => s.userId === user.id) ?? null) : null;
  const occupied = state.blackjackTableSeats.length > 0;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    pollBlackjackTable().catch(() => {});
    const id = setInterval(() => {
      pollBlackjackTable().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Auto-leave on navigating away — a seat left behind by someone who just
  // clicked to another page would otherwise sit there forever, keeping the
  // table from ever going quiet. Only fires between rounds (same rule as
  // the manual "Leave table" button); a live hand is never abandoned.
  const mySeatRef = useRef(mySeat);
  useEffect(() => {
    mySeatRef.current = mySeat;
  }, [mySeat]);
  useEffect(() => {
    return () => {
      const seat = mySeatRef.current;
      if (seat && (seat.status === "seated" || seat.status === "resolved")) {
        leaveBlackjackTable(seat.id).catch(() => {});
      }
    };
  }, []);

  // Phase engine: whichever client's timer gets here first drives the table
  // forward. All writes are atomic-claim guarded in the store, so
  // simultaneous triggers from other open tabs are harmless. Frozen
  // entirely while no one's seated — no live hand can exist with zero
  // seats (leaving mid-hand is blocked), so there's nothing to advance,
  // and joinBlackjackTable gives the next person a fresh betting window.
  useEffect(() => {
    if (!table) {
      ensureBlackjackTable().catch(() => {});
      return;
    }
    if (!occupied) return;

    if (table.status === "betting" && now >= new Date(table.bettingClosesAt).getTime()) {
      closeBlackjackTableBettingIfDue(table).catch(() => {});
      return;
    }

    if (table.status === "player_turns") {
      nudgeBlackjackTableIfStale(table).catch(() => {});
      autoStandBlackjackTableSeatIfDue(table).catch(() => {});
      return;
    }

    if (table.status === "resolved") {
      if (resolvedAt?.tableId !== table.id) {
        setResolvedAt({ tableId: table.id, at: now });
        return;
      }
      if (now - resolvedAt.at >= RESULT_PAUSE_MS) {
        ensureNextBlackjackRound(table).catch(() => {});
      }
    }
  }, [table, now, resolvedAt, occupied]);

  if (!user) return null;
  if (!table) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-(--color-ink-soft)">
        Opening the table…
      </div>
    );
  }

  const seats: (BlackjackTableSeat | null)[] = Array.from({ length: BLACKJACK_TABLE_SEATS }, (_, i) =>
    state.blackjackTableSeats.find((s) => s.seatIndex === i) ?? null,
  );
  const isMyTurn = table.status === "player_turns" && mySeat && table.currentSeatIndex === mySeat.seatIndex;
  const dealerTotal = table.dealerCards ? handValue(table.dealerCards) : null;
  const dealerRevealed = table.status === "dealer_turn" || table.status === "resolved";
  const secondsLeft = Math.max(0, Math.ceil((new Date(table.bettingClosesAt).getTime() - now) / 1000));
  const turnSecondsLeft = table.turnEndsAt
    ? Math.max(0, Math.ceil((new Date(table.turnEndsAt).getTime() - now) / 1000))
    : null;

  async function handleJoin(seatIndex: number) {
    if (!user || busy) return;
    setError(null);
    setBusy(true);
    try {
      await joinBlackjackTable(table!.id, user.id, seatIndex);
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
      await leaveBlackjackTable(mySeat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleBet() {
    if (!user || !mySeat || busy) return;
    setError(null);
    setBusy(true);
    try {
      await placeBlackjackTableBet(table!.id, mySeat.id, user.id, chip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleHit() {
    if (!mySeat || busy) return;
    setError(null);
    setBusy(true);
    try {
      await hitBlackjackTableSeat(mySeat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleStand() {
    if (!mySeat || busy) return;
    setError(null);
    setBusy(true);
    try {
      await standBlackjackTableSeat(mySeat.id);
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
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl font-semibold text-(--color-ink)">Blackjack Table</h1>
          <HelpButton onClick={() => setShowHelp(true)} />
        </div>
        <Link to="/casino/blackjack" className="text-xs font-medium text-(--color-ink-soft) hover:text-(--color-ink)">
          Play solo →
        </Link>
      </div>

      {showHelp && (
        <HelpModal title="How to play Blackjack Table" onClose={() => setShowHelp(false)}>
          <p>
            A shared table — up to {BLACKJACK_TABLE_SEATS} people sit down and play against the same dealer. Sit at
            an empty seat any time the table's open for betting.
          </p>
          <p>
            Each round: a {" "}
            <strong>betting window</strong> opens for everyone seated to place a bet, then cards are dealt. Seated
            players who didn't bet just sit out that round.
          </p>
          <p>
            Players act <strong>in seat order</strong> — hit or stand on your turn, with {BLACKJACK_TABLE_TURN_MS / 1000}s
            to decide before you're auto-stood. Once everyone's done, the dealer plays (stands on all 17s) and
            everyone still in gets paid out. Same rules as solo Blackjack: blackjack pays 3:2, a normal win pays 2x,
            bust loses immediately.
          </p>
          <p className="text-(--color-ink-soft)">
            Leaving is only allowed between rounds — you can't walk away mid-hand. Navigating away from this page
            auto-leaves your seat for you. The table sits idle whenever no one's seated.
          </p>
        </HelpModal>
      )}

      <div className="mt-4 rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-(--color-ink-soft)">
          Dealer{" "}
          {dealerRevealed && dealerTotal && (
            <span className="font-mono normal-case">
              · {dealerTotal.total}
              {dealerTotal.soft ? " (soft)" : ""}
            </span>
          )}
        </p>
        <div className="mt-2">
          {table.dealerCards ? (
            <MiniCardRow cards={dealerRevealed ? table.dealerCards : table.dealerCards.slice(0, 1)} />
          ) : (
            <p className="text-xs text-(--color-ink-soft)">—</p>
          )}
        </div>

        <p className="mt-3 font-display text-sm font-semibold text-(--color-ink)">
          {!occupied && "Table's empty — sit down to start a round"}
          {occupied && table.status === "betting" && `Place your bets · ${secondsLeft}s`}
          {occupied &&
            table.status === "player_turns" &&
            (isMyTurn ? `Your turn${turnSecondsLeft !== null ? ` · ${turnSecondsLeft}s` : ""}` : "Players acting…")}
          {occupied && table.status === "dealer_turn" && "Dealer playing…"}
          {occupied && table.status === "resolved" && "Round over"}
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-(--color-no-soft) px-4 py-3 text-center text-sm text-(--color-no-text)">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {seats.map((seat, i) => {
          const player = seat ? state.users.find((u) => u.id === seat.userId) : null;
          const isMe = seat?.userId === user.id;
          const total = seat?.playerCards ? handValue(seat.playerCards) : null;
          const outcome = seat?.outcome ? OUTCOME_COPY[seat.outcome] : null;
          const isCurrentTurn = table.status === "player_turns" && table.currentSeatIndex === i;

          return (
            <div
              key={i}
              className={`rounded-xl bg-(--color-surface) p-3 shadow-sm shadow-black/5 ${
                isCurrentTurn ? "ring-2 ring-(--color-ink)" : ""
              }`}
            >
              {!seat ? (
                <button
                  type="button"
                  disabled={busy || !!mySeat || (occupied && table.status !== "betting")}
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
                      </span>
                    </div>
                    {seat.betAmount !== null && (
                      <span className="font-mono text-xs font-semibold text-(--color-ink)">{seat.betAmount}</span>
                    )}
                  </div>

                  {seat.playerCards && (
                    <div className="mt-2">
                      <MiniCardRow cards={seat.playerCards} />
                      {total && (
                        <p className="mt-1 text-center font-mono text-xs text-(--color-ink-soft)">
                          {total.total}
                          {total.soft ? " (soft)" : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {outcome && (
                    <p className={`mt-1 text-center text-xs font-semibold ${outcome.className}`}>
                      {outcome.label}
                      {seat.payout !== null && seat.payout > 0 && seat.betAmount !== null && (
                        <> +{Math.round(seat.payout - seat.betAmount)}</>
                      )}
                    </p>
                  )}
                  {seat.status === "bust" && (
                    <p className="mt-1 text-center text-xs font-semibold text-(--color-no-text)">Bust</p>
                  )}

                  {isMe && (
                    <>
                      {seat.status === "seated" && seat.betAmount === null && table.status === "betting" && (
                        <button
                          type="button"
                          disabled={busy || chip > user.tokenBalance}
                          onClick={handleBet}
                          className="mt-2 w-full rounded-lg bg-(--color-ink) py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                        >
                          Bet {chip}
                        </button>
                      )}
                      {isCurrentTurn && seat.status === "playing" && (
                        <div className="mt-2 flex gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handleHit}
                            className="flex-1 rounded-lg bg-(--color-ink) py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                          >
                            Hit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handleStand}
                            className="flex-1 rounded-lg bg-(--color-bg) py-1.5 text-xs font-semibold text-(--color-ink) transition hover:opacity-90 disabled:opacity-60"
                          >
                            Stand
                          </button>
                        </div>
                      )}
                      {(seat.status === "seated" || seat.status === "resolved") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleLeave}
                          className="mt-2 w-full text-center text-[11px] text-(--color-ink-soft) hover:text-(--color-ink)"
                        >
                          Leave table
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {mySeat && mySeat.status === "seated" && mySeat.betAmount === null && table.status === "betting" && (
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
      )}

      <p className="mt-4 text-center text-xs text-(--color-ink-soft)">
        Up to {BLACKJACK_TABLE_SEATS} seats · turns go in order, {BLACKJACK_TABLE_TURN_MS / 1000}s to act · dealer
        stands on all 17s · blackjack pays 3:2 · minimum bet {BLACKJACK_MIN_BET} tokens
      </p>
    </div>
  );
}
