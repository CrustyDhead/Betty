export const SLOTS_MIN_BET = 10;

export interface SlotsSymbol {
  emoji: string;
  weight: number;
  payout: number; // multiplier for 3-of-a-kind
}

// Weighted so the jackpot symbol stays rare. Any 2-of-3 match (not all 3)
// pays back the stake — a breakeven "so close" outcome, same near-miss
// framing the rest of the app already uses for real bets.
export const SLOTS_SYMBOLS: SlotsSymbol[] = [
  { emoji: "🍒", weight: 40, payout: 3 },
  { emoji: "🍋", weight: 25, payout: 5 },
  { emoji: "🔔", weight: 15, payout: 10 },
  { emoji: "💎", weight: 12, payout: 25 },
  { emoji: "7️⃣", weight: 8, payout: 100 },
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
  return [rollSymbol(), rollSymbol(), rollSymbol()];
}

export function calculateSlotsPayout(reels: string[], amount: number): number {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    const symbol = SLOTS_SYMBOLS.find((s) => s.emoji === a);
    return symbol ? amount * symbol.payout : 0;
  }
  if (a === b || b === c || a === c) return amount; // near miss — stake back
  return 0;
}
