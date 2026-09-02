import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { spinSlots } from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { TogglePill } from "../components/TogglePill";
import { HelpButton, HelpModal } from "../components/HelpModal";
import { SLOTS_MIN_BET, SLOTS_REELS, SLOTS_SYMBOLS } from "../lib/slots";

const CHIP_VALUES = [10, 50, 100, 500] as const;
const FLICKER_MS = 80;
// Each reel locks in a bit later than the last, left to right, like a real
// machine's reels stopping one at a time instead of all snapping at once.
const REEL_STOP_DELAYS_MS = [500, 850, 1200, 1550, 1900];

function randomEmoji(): string {
  return SLOTS_SYMBOLS[Math.floor(Math.random() * SLOTS_SYMBOLS.length)].emoji;
}

export function Slots() {
  const user = useCurrentUser();
  const state = useStoreState();

  const [chip, setChip] = useState<(typeof CHIP_VALUES)[number]>(10);
  const [displayReels, setDisplayReels] = useState<string[]>(() => Array.from({ length: SLOTS_REELS }, () => "❔"));
  const [lockedCount, setLockedCount] = useState(SLOTS_REELS);
  const [spinning, setSpinning] = useState(false);
  const [lastPayout, setLastPayout] = useState<{ amount: number; payout: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  if (!user) return null;

  const mySpins = state.slotsSpins.filter((s) => s.userId === user.id).slice(0, 10);

  async function handleSpin() {
    if (!user || spinning) return;
    setError(null);
    setSpinning(true);
    setLastPayout(null);
    setLockedCount(0);
    timers.current.forEach(clearTimeout);
    timers.current = [];

    let finalReels: string[];
    let payoutResult: { amount: number; payout: number };
    try {
      const spin = await spinSlots(user.id, chip);
      finalReels = spin.reels;
      payoutResult = { amount: spin.amount, payout: spin.payout };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSpinning(false);
      setLockedCount(SLOTS_REELS);
      return;
    }

    const lockedCountRef = { current: 0 };
    const flicker = setInterval(() => {
      setDisplayReels((prev) => prev.map((s, i) => (i >= lockedCountRef.current ? randomEmoji() : s)));
    }, FLICKER_MS);
    timers.current.push(flicker as unknown as ReturnType<typeof setTimeout>);

    REEL_STOP_DELAYS_MS.slice(0, SLOTS_REELS).forEach((delay, i) => {
      const t = setTimeout(() => {
        lockedCountRef.current = i + 1;
        setLockedCount(i + 1);
        setDisplayReels((prev) => prev.map((s, idx) => (idx === i ? finalReels[i] : s)));
        if (i === SLOTS_REELS - 1) {
          clearInterval(flicker);
          setLastPayout(payoutResult);
          setSpinning(false);
        }
      }, delay);
      timers.current.push(t);
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/casino" className="text-sm font-medium text-(--color-ink-soft) hover:text-(--color-ink)">
        ← Casino
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <h1 className="font-display text-xl font-semibold text-(--color-ink)">Slots</h1>
        <HelpButton onClick={() => setShowHelp(true)} />
      </div>

      {showHelp && (
        <HelpModal title="How to play Slots" onClose={() => setShowHelp(false)}>
          <p>
            Pick a bet size and spin {SLOTS_REELS} reels. Real payline rules: matching symbols have to run{" "}
            <strong>left to right starting from reel 1</strong> — landing the same symbol on reels 1, 3, and 5 isn't
            a win, only a run like 1-2-3 (or further) counts. You need at least 3 in a row from the left to win
            anything.
          </p>
          <p>
            Each symbol has its own payout for a 3, 4, or 5-long run, shown in the Payouts table below — rarer
            symbols (fewer of them on the reels) pay much more. Your winnings are your bet × that multiplier. Real
            paylines make wins genuinely rare, so the payouts are big when they land.
          </p>
          <p className="text-(--color-ink-soft)">
            Example: bet 10, reels 1-4 all land 💎 (reel 5 different) → 4-in-a-row pays 260x → you get back 2,600
            tokens. Minimum bet {SLOTS_MIN_BET} tokens.
          </p>
        </HelpModal>
      )}

      <div className="mt-4 rounded-2xl bg-(--color-surface) p-6 text-center shadow-sm shadow-black/5">
        <div className="flex justify-center gap-1.5 sm:gap-3">
          {displayReels.map((symbol, i) => (
            <div
              key={i}
              className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-bg) text-2xl shadow-inner transition-transform sm:h-20 sm:w-20 sm:text-4xl ${
                spinning && i >= lockedCount ? "animate-pulse" : spinning && i === lockedCount - 1 ? "scale-110" : ""
              }`}
            >
              {symbol}
            </div>
          ))}
        </div>

        {lastPayout &&
          (() => {
            const net = lastPayout.payout - lastPayout.amount;
            return (
              <p
                className={`mt-4 font-display text-sm font-semibold ${
                  net > 0 ? "text-(--color-yes-text)" : net < 0 ? "text-(--color-no-text)" : "text-(--color-ink-soft)"
                }`}
              >
                {net > 0
                  ? `You won ${Math.round(net)} tokens! 🎉`
                  : net < 0
                    ? `Lost ${Math.round(lastPayout.amount)} tokens.`
                    : "Push — stake back."}
              </p>
            );
          })()}

        {error && (
          <p className="mt-4 rounded-xl bg-(--color-no-soft) px-4 py-3 text-sm text-(--color-no-text)">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSpin}
          disabled={spinning || chip > user.tokenBalance}
          className="mt-5 w-full rounded-xl bg-(--color-ink) py-3 font-display text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {spinning ? "Spinning…" : `Spin for ${chip}`}
        </button>
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

      <div className="mt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
          Payouts
        </h2>
        <div className="mt-2 space-y-1">
          {SLOTS_SYMBOLS.map((s) => (
            <div
              key={s.emoji}
              className="flex items-center justify-between rounded-lg bg-(--color-surface) px-3 py-1.5 text-xs shadow-sm shadow-black/5"
            >
              <span>{s.emoji}</span>
              <span className="flex gap-3 font-mono text-(--color-ink-soft)">
                {s.payouts.map((p) => (
                  <span key={p.matches}>
                    {p.matches}× {p.multiplier}x
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-(--color-ink-soft)">
          Payline pays: need 3+ matching in a row starting from reel 1 (left). Minimum bet {SLOTS_MIN_BET} tokens.
        </p>
      </div>

      {mySpins.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Recent spins
          </h2>
          <div className="mt-2 space-y-1.5">
            {mySpins.map((s) => {
              const net = s.payout - s.amount;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg bg-(--color-surface) px-3 py-2 text-xs shadow-sm shadow-black/5"
                >
                  <span>{s.reels.join(" ")}</span>
                  <span
                    className={`font-mono font-medium ${
                      net > 0 ? "text-(--color-yes-text)" : net < 0 ? "text-(--color-no-text)" : "text-(--color-ink-soft)"
                    }`}
                  >
                    {net > 0 ? `+${Math.round(net)}` : Math.round(net)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
