export const SLOTS_MIN_BET = 10;
export const SLOTS_REELS = 5;

export interface SlotsPayoutTier {
  matches: number; // how many of the 5 reels need to show this symbol
  multiplier: number;
}

export interface SlotsSymbol {
  emoji: string;
  weight: number;
  payouts: SlotsPayoutTier[]; // 3, 4, 5-of-a-kind, rarest symbol last
}

// 8 symbols across 5 reels, weighted so the rarest (🎰) is genuinely rare.
// A win requires at least 3 of the 5 reels to match — no payout for just a
// pair anymore (that "any 2 matching" freebie, combined with only 3 reels,
// used to fire on ~63% of spins and push RTP to ~121%; see slots RTP audit
// in chat). With 5 reels and an 8-symbol table, a 3+ match happens on
// ~30% of spins and this payout table lands at ~88.5% RTP overall —
// meaningfully harder, still a normal generous-house-edge game rather than
// a guaranteed money printer.
export const SLOTS_SYMBOLS: SlotsSymbol[] = [
  { emoji: "🍒", weight: 30, payouts: [{ matches: 3, multiplier: 1 }, { matches: 4, multiplier: 4 }, { matches: 5, multiplier: 30 }] },
  { emoji: "🍋", weight: 22, payouts: [{ matches: 3, multiplier: 2 }, { matches: 4, multiplier: 7 }, { matches: 5, multiplier: 48 }] },
  { emoji: "🍊", weight: 18, payouts: [{ matches: 3, multiplier: 3 }, { matches: 4, multiplier: 11 }, { matches: 5, multiplier: 70 }] },
  { emoji: "🔔", weight: 12, payouts: [{ matches: 3, multiplier: 5 }, { matches: 4, multiplier: 18 }, { matches: 5, multiplier: 120 }] },
  { emoji: "⭐", weight: 8, payouts: [{ matches: 3, multiplier: 9 }, { matches: 4, multiplier: 30 }, { matches: 5, multiplier: 220 }] },
  { emoji: "💎", weight: 6, payouts: [{ matches: 3, multiplier: 14 }, { matches: 4, multiplier: 48 }, { matches: 5, multiplier: 360 }] },
  { emoji: "7️⃣", weight: 3, payouts: [{ matches: 3, multiplier: 28 }, { matches: 4, multiplier: 120 }, { matches: 5, multiplier: 700 }] },
  { emoji: "🎰", weight: 1, payouts: [{ matches: 3, multiplier: 55 }, { matches: 4, multiplier: 220 }, { matches: 5, multiplier: 1500 }] },
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

// Pays on whichever symbol has the most matches among the 5 reels, as long
// as that's at least 3 (two different symbols can't both reach 3 out of 5,
// so there's never more than one winning symbol to pick between).
export function calculateSlotsPayout(reels: string[], amount: number): number {
  const counts = new Map<string, number>();
  for (const r of reels) counts.set(r, (counts.get(r) ?? 0) + 1);

  let bestEmoji: string | null = null;
  let bestCount = 0;
  for (const [emoji, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestEmoji = emoji;
    }
  }
  if (!bestEmoji || bestCount < 3) return 0;

  const symbol = SLOTS_SYMBOLS.find((s) => s.emoji === bestEmoji);
  if (!symbol) return 0;
  const tier = symbol.payouts.find((p) => p.matches === bestCount) ?? symbol.payouts[symbol.payouts.length - 1];
  return amount * tier.multiplier;
}
