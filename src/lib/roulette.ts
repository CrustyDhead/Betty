import type { RouletteBet, RouletteBetType, RouletteLuckyNumber } from "../types";

export const ROULETTE_BETTING_MS = 20_000;
export const ROULETTE_LUCKY_REVEAL_MS = 3_000;
export const ROULETTE_SPIN_MS = 4_000;
export const ROULETTE_MIN_BET = 10;
export const ROULETTE_CHIP_VALUES = [10, 50, 100, 500] as const;

export const ROULETTE_RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

// Weighted so the big multipliers stay rare — matches real lightning-style
// roulette formats where 500x should feel like a genuine event, not a
// coinflip.
const MULTIPLIER_WEIGHTS: [number, number][] = [
  [50, 50],
  [100, 30],
  [200, 15],
  [500, 5],
];

function rollMultiplier(): number {
  const totalWeight = MULTIPLIER_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * totalWeight;
  for (const [multiplier, weight] of MULTIPLIER_WEIGHTS) {
    if (r < weight) return multiplier;
    r -= weight;
  }
  return MULTIPLIER_WEIGHTS[0][0];
}

export function rollLuckyNumbers(): RouletteLuckyNumber[] {
  const picked = new Set<number>();
  while (picked.size < 3) {
    picked.add(Math.floor(Math.random() * 37));
  }
  return [...picked].map((number) => ({ number, multiplier: rollMultiplier() }));
}

export function rollWinningNumber(): number {
  return Math.floor(Math.random() * 37);
}

export function numberColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return ROULETTE_RED_NUMBERS.has(n) ? "red" : "black";
}

function betWins(bet: { betType: RouletteBetType; betValue: string | null }, winningNumber: number): boolean {
  const color = numberColor(winningNumber);
  switch (bet.betType) {
    case "number":
      return Number(bet.betValue) === winningNumber;
    case "red":
      return color === "red";
    case "black":
      return color === "black";
    case "odd":
      return winningNumber !== 0 && winningNumber % 2 === 1;
    case "even":
      return winningNumber !== 0 && winningNumber % 2 === 0;
    case "low":
      return winningNumber >= 1 && winningNumber <= 18;
    case "high":
      return winningNumber >= 19 && winningNumber <= 36;
  }
}

// Standard odds: 36x total for a straight-up number (35:1 + stake back),
// 2x total for every even-money outside bet (1:1 + stake back). A lucky
// number that hits replaces the straight-up payout with stake x multiplier
// entirely — outside bets are never affected by lucky numbers.
export function calculatePayout(
  bet: Pick<RouletteBet, "betType" | "betValue" | "amount">,
  winningNumber: number,
  luckyNumbers: RouletteLuckyNumber[] | null,
): number {
  if (!betWins(bet, winningNumber)) return 0;
  if (bet.betType === "number") {
    const lucky = luckyNumbers?.find((l) => l.number === winningNumber);
    if (lucky) return bet.amount * lucky.multiplier;
    return bet.amount * 36;
  }
  return bet.amount * 2;
}
