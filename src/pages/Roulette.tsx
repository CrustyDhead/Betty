import { useEffect, useRef, useState } from "react";
import {
  closeRouletteBettingIfDue,
  currentRouletteRound,
  ensureActiveRouletteRound,
  placeRouletteBet,
  pollRoulette,
  resolveRouletteRound,
  rouletteBetsForRound,
} from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import {
  ROULETTE_BETTING_MS,
  ROULETTE_CHIP_VALUES,
  ROULETTE_LUCKY_REVEAL_MS,
  ROULETTE_SPIN_MS,
  numberColor,
} from "../lib/roulette";
import type { RouletteBetType } from "../types";

const POLL_MS = 1_500;
const RESULT_PAUSE_MS = 4_000;

const OUTSIDE_BETS: { type: RouletteBetType; label: string }[] = [
  { type: "red", label: "Red" },
  { type: "black", label: "Black" },
  { type: "odd", label: "Odd" },
  { type: "even", label: "Even" },
  { type: "low", label: "1–18" },
  { type: "high", label: "19–36" },
];

const NUMBER_GRID = Array.from({ length: 37 }, (_, i) => i);

function colorClasses(color: "red" | "black" | "green") {
  if (color === "red") return "bg-(--color-no-text) text-white";
  if (color === "green") return "bg-(--color-yes-text) text-white";
  return "bg-(--color-ink) text-white";
}

function betKey(type: RouletteBetType, value: string | null) {
  return `${type}:${value ?? ""}`;
}

export function Roulette() {
  const user = useCurrentUser();
  const state = useStoreState();
  const round = currentRouletteRound();

  const [chip, setChip] = useState<(typeof ROULETTE_CHIP_VALUES)[number]>(10);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [spinningStartedAt, setSpinningStartedAt] = useState<{ roundId: string; at: number } | null>(null);
  const [resolvedAt, setResolvedAt] = useState<{ roundId: string; at: number } | null>(null);
  const advancing = useRef(false);

  // Fast local clock for countdown/animation math.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Roulette-only fast poll — the app-wide 15s poll is too slow for a 20s
  // round to feel alive, so this page runs its own tighter one instead.
  useEffect(() => {
    pollRoulette().catch(() => {});
    const id = setInterval(() => {
      pollRoulette().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Phase engine: whichever client's timer gets here first drives the
  // round forward. All the actual writes are atomic-claim guarded in the
  // store, so simultaneous triggers from other open tabs are harmless.
  useEffect(() => {
    if (!round) {
      ensureActiveRouletteRound(ROULETTE_BETTING_MS).catch(() => {});
      return;
    }

    if (round.status === "betting" && now >= new Date(round.bettingClosesAt).getTime()) {
      closeRouletteBettingIfDue(round).catch(() => {});
      return;
    }

    if (round.status === "spinning") {
      if (spinningStartedAt?.roundId !== round.id) {
        setSpinningStartedAt({ roundId: round.id, at: now });
        return;
      }
      const elapsed = now - spinningStartedAt.at;
      if (elapsed >= ROULETTE_LUCKY_REVEAL_MS + ROULETTE_SPIN_MS && !advancing.current) {
        advancing.current = true;
        resolveRouletteRound(round.id).finally(() => {
          advancing.current = false;
        });
      }
      return;
    }

    if (round.status === "resolved") {
      if (resolvedAt?.roundId !== round.id) {
        setResolvedAt({ roundId: round.id, at: now });
        return;
      }
      const elapsed = now - resolvedAt.at;
      if (elapsed >= RESULT_PAUSE_MS) {
        ensureActiveRouletteRound(ROULETTE_BETTING_MS).catch(() => {});
      }
    }
  }, [round, now, spinningStartedAt, resolvedAt]);

  if (!user) return null;
  if (!round) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-(--color-ink-soft)">
        Starting a round…
      </div>
    );
  }

  const myBets = rouletteBetsForRound(round.id).filter((b) => b.userId === user.id);
  const allBets = rouletteBetsForRound(round.id);
  const totals = new Map<string, number>();
  for (const b of allBets) {
    const key = betKey(b.betType, b.betValue);
    totals.set(key, (totals.get(key) ?? 0) + b.amount);
  }
  const myTotals = new Map<string, number>();
  for (const b of myBets) {
    const key = betKey(b.betType, b.betValue);
    myTotals.set(key, (myTotals.get(key) ?? 0) + b.amount);
  }
  const myStake = myBets.reduce((sum, b) => sum + b.amount, 0);
  const myPayout = myBets.reduce((sum, b) => sum + (b.payout ?? 0), 0);

  const secondsLeft = Math.max(0, Math.ceil((new Date(round.bettingClosesAt).getTime() - now) / 1000));
  const spinningElapsed = spinningStartedAt?.roundId === round.id ? now - spinningStartedAt.at : 0;
  const showLucky = round.status === "spinning" || round.status === "resolved";
  const showWinner =
    round.status === "resolved" || (round.status === "spinning" && spinningElapsed >= ROULETTE_LUCKY_REVEAL_MS);

  async function handleBet(betType: RouletteBetType, betValue: string | null) {
    if (!user || round!.status !== "betting" || placing) return;
    setError(null);
    setPlacing(true);
    try {
      await placeRouletteBet(round!.id, user.id, betType, betValue, chip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">🎰 Roulette</h1>

      <div className="mt-4 rounded-2xl bg-(--color-surface) p-4 text-center shadow-sm shadow-black/5">
        {round.status === "betting" && (
          <>
            <p className="font-display text-sm font-semibold text-(--color-ink)">Place your bets</p>
            <p className="mt-1 font-mono text-3xl font-bold text-(--color-ink)">{secondsLeft}s</p>
          </>
        )}
        {round.status === "spinning" && !showWinner && (
          <p className="font-display text-sm font-semibold text-(--color-ink)">🔒 Bets closed — spinning…</p>
        )}
        {round.status === "spinning" && showWinner && (
          <p className="font-display text-sm font-semibold text-(--color-ink)">🎲 Landed on…</p>
        )}
        {round.status === "resolved" && (
          <p className="font-display text-sm font-semibold text-(--color-ink)">
            {myStake > 0
              ? myPayout > myStake
                ? `You won ${Math.round(myPayout - myStake)} tokens! 🎉`
                : myStake > 0
                  ? "No luck this round."
                  : ""
              : "Round over"}
          </p>
        )}

        {showLucky && round.luckyNumbers && (
          <div className="mt-2 flex justify-center gap-2">
            {round.luckyNumbers.map((l) => (
              <span
                key={l.number}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colorClasses(numberColor(l.number))}`}
              >
                {l.number} ⚡{l.multiplier}x
              </span>
            ))}
          </div>
        )}

        {showWinner && round.winningNumber !== null && (
          <div className="mt-3 flex justify-center">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full font-display text-2xl font-bold ${colorClasses(
                numberColor(round.winningNumber),
              )}`}
            >
              {round.winningNumber}
            </span>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-center text-sm text-(--color-no-text)">{error}</p>}

      <div className="mt-4 grid grid-cols-6 gap-1.5 sm:grid-cols-9">
        {NUMBER_GRID.map((n) => {
          const key = betKey("number", String(n));
          const mine = myTotals.get(key);
          return (
            <button
              key={n}
              type="button"
              disabled={round.status !== "betting" || placing}
              onClick={() => handleBet("number", String(n))}
              className={`relative flex h-10 items-center justify-center rounded-lg font-mono text-sm font-semibold transition disabled:opacity-60 ${colorClasses(
                numberColor(n),
              )}`}
            >
              {n}
              {mine !== undefined && (
                <span className="absolute -top-1.5 -right-1.5 rounded-full bg-white px-1 text-[10px] font-bold text-(--color-ink) shadow">
                  {mine}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {OUTSIDE_BETS.map((b) => {
          const key = betKey(b.type, null);
          const mine = myTotals.get(key);
          const total = totals.get(key);
          return (
            <button
              key={b.type}
              type="button"
              disabled={round.status !== "betting" || placing}
              onClick={() => handleBet(b.type, null)}
              className="relative rounded-lg bg-(--color-surface) py-2.5 text-sm font-medium text-(--color-ink) shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {b.label}
              {total !== undefined && (
                <span className="mt-0.5 block font-mono text-xs text-(--color-ink-soft)">{total}</span>
              )}
              {mine !== undefined && (
                <span className="absolute -top-1.5 -right-1.5 rounded-full bg-(--color-ink) px-1 text-[10px] font-bold text-white shadow">
                  {mine}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 rounded-2xl bg-(--color-surface) p-3 shadow-sm shadow-black/5">
        <span className="text-xs font-medium text-(--color-ink-soft)">Chip</span>
        <div className="flex gap-1.5">
          {ROULETTE_CHIP_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setChip(v)}
              className={`rounded-full px-3 py-1.5 font-mono text-sm font-semibold transition ${
                chip === v ? "bg-(--color-ink) text-white" : "bg-(--color-bg) text-(--color-ink-soft)"
              }`}
            >
              x{v}
            </button>
          ))}
        </div>
        <span className="font-mono text-sm font-semibold text-(--color-ink)">
          {Math.round(user.tokenBalance).toLocaleString()}
        </span>
      </div>

      {myStake > 0 && (
        <p className="mt-3 text-center text-xs text-(--color-ink-soft)">
          You've staked {myStake} tokens this round
          {round.status === "resolved" && ` · payout ${Math.round(myPayout)}`}
        </p>
      )}

      {allBets.length > 0 && (
        <p className="mt-1 text-center text-xs text-(--color-ink-soft)">
          {new Set(allBets.map((b) => b.userId)).size} people in ·{" "}
          {allBets.reduce((sum, b) => sum + b.amount, 0).toLocaleString()} tokens on the table
        </p>
      )}

      {state.rouletteRounds.filter((r) => r.status === "resolved").length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Recent numbers
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {state.rouletteRounds
              .filter((r) => r.status === "resolved" && r.winningNumber !== null)
              .slice(0, 15)
              .map((r) => (
                <span
                  key={r.id}
                  className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-semibold ${colorClasses(
                    numberColor(r.winningNumber!),
                  )}`}
                >
                  {r.winningNumber}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
