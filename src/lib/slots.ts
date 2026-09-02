export const SLOTS_MIN_BET = 10;
export const SLOTS_REELS = 5;

export interface SlotsPayoutTier {
  matches: number; // consecutive reels matched, starting from reel 1 (leftmost)
  multiplier: number;
}

export interface SlotsSymbol {
  emoji: string;
  weight: number;
  payouts: SlotsPayoutTier[]; // 3, 4, 5-of-a-kind, rarest symbol last
}

// A real machine pays on a payline: matching symbols have to run
// consecutively starting from the leftmost reel — landing 🍒 on reels
// 1, 3, and 5 isn't a win, only reels 1-2-3 (or further) in a row counts.
// The previous version paid on "any 3+ matching anywhere," which isn't how
// any real slot machine works and made wins much too frequent for a
// weighted 8-symbol table. A strict payline drops the win rate to ~4.6% of
// spins — genuinely rare, matching real machines' volatility — so payouts
// are scaled up accordingly to land at the same ~88% RTP as before: rare
// wins, but a real one when it lands.
export const SLOTS_SYMBOLS: SlotsSymbol[] = [
  { emoji: "🍒", weight: 30, payouts: [{ matches: 3, multiplier: 3 }, { matches: 4, multiplier: 13 }, { matches: 5, multiplier: 130 }] },
  { emoji: "🍋", weight: 22, payouts: [{ matches: 3, multiplier: 5 }, { matches: 4, multiplier: 25 }, { matches: 5, multiplier: 220 }] },
  { emoji: "🍊", weight: 18, payouts: [{ matches: 3, multiplier: 8 }, { matches: 4, multiplier: 45 }, { matches: 5, multiplier: 350 }] },
  { emoji: "🔔", weight: 12, payouts: [{ matches: 3, multiplier: 14 }, { matches: 4, multiplier: 80 }, { matches: 5, multiplier: 580 }] },
  { emoji: "⭐", weight: 8, payouts: [{ matches: 3, multiplier: 25 }, { matches: 4, multiplier: 140 }, { matches: 5, multiplier: 1000 }] },
  { emoji: "💎", weight: 6, payouts: [{ matches: 3, multiplier: 45 }, { matches: 4, multiplier: 260 }, { matches: 5, multiplier: 1600 }] },
  { emoji: "7️⃣", weight: 3, payouts: [{ matches: 3, multiplier: 100 }, { matches: 4, multiplier: 520 }, { matches: 5, multiplier: 2900 }] },
  { emoji: "🎰", weight: 1, payouts: [{ matches: 3, multiplier: 220 }, { matches: 4, multiplier: 1100 }, { matches: 5, multiplier: 6200 }] },
];

function rollSymbol(): string {
  const totalWeight = SLOTS_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * totalWeight;
  for (const s of SLOTS_SYMBOLS) {
    if (r < s.weight) return s.emoji;
    r -= s.weight;
  }
  return SLOTS_SYMBOLS[0].emoji;
}

export function rollReels(): string[] {
  return Array.from({ length: SLOTS_REELS }, rollSymbol);
}

// Payline payout: the length of the run of matching symbols starting at
// reel 1 (leftmost), stopping at the first reel that breaks it. Only that
// run counts — a symbol repeating later after a break doesn't add to it.
export function calculateSlotsPayout(reels: string[], amount: number): number {
  const first = reels[0];
  let runLength = 1;
  for (let i = 1; i < reels.length; i++) {
    if (reels[i] !== first) break;
    runLength++;
  }
  if (runLength < 3) return 0;

  const symbol = SLOTS_SYMBOLS.find((s) => s.emoji === first);
  if (!symbol) return 0;
  const tier = symbol.payouts.find((p) => p.matches === runLength) ?? symbol.payouts[symbol.payouts.length - 1];
  return amount * tier.multiplier;
}
