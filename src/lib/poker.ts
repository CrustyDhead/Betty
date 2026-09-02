import type { PlayingCard, Suit } from "../types";

export const POKER_SEATS = 6;
export const POKER_SMALL_BLIND = 10;
export const POKER_BIG_BLIND = 20;
export const POKER_TURN_MS = 20_000;
export const POKER_HAND_OVER_PAUSE_MS = 5_000;

const RANKS: PlayingCard["rank"][] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

export function createShuffledDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  // Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function formatCard(card: PlayingCard): string {
  return `${card.rank}${card.suit}`;
}

function rankValue(rank: PlayingCard["rank"]): number {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

export const HAND_CATEGORY_NAMES = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
];

export interface EvaluatedHand {
  category: number; // 0 (high card) .. 8 (straight flush)
  tiebreak: number[]; // descending significance, for comparing hands of the same category
  cards: PlayingCard[]; // the best 5 cards
}

function straightTop(sortedDescUniqueRanks: number[]): number | null {
  // Ace-low ("wheel") straight: A-2-3-4-5, ranked as a 5-high straight.
  const ranks = sortedDescUniqueRanks.includes(14)
    ? [...sortedDescUniqueRanks, 1]
    : sortedDescUniqueRanks;
  for (let i = 0; i <= ranks.length - 5; i++) {
    if (ranks[i] - ranks[i + 4] === 4) return ranks[i];
  }
  return null;
}

function evaluate5(cards: PlayingCard[]): EvaluatedHand {
  const ranks = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));

  const uniqueRanksDesc = [...counts.keys()].sort((a, b) => b - a);
  const straightHigh = straightTop(uniqueRanksDesc);

  if (isFlush && straightHigh !== null) return { category: 8, tiebreak: [straightHigh], cards };
  if (groups[0][1] === 4) return { category: 7, tiebreak: [groups[0][0], groups[1][0]], cards };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 6, tiebreak: [groups[0][0], groups[1][0]], cards };
  if (isFlush) return { category: 5, tiebreak: ranks, cards };
  if (straightHigh !== null) return { category: 4, tiebreak: [straightHigh], cards };
  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map(([r]) => r);
    return { category: 3, tiebreak: [groups[0][0], ...kickers], cards };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const [hi, lo] = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups[2][0];
    return { category: 2, tiebreak: [hi, lo, kicker], cards };
  }
  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map(([r]) => r);
    return { category: 1, tiebreak: [groups[0][0], ...kickers], cards };
  }
  return { category: 0, tiebreak: ranks, cards };
}

function combinations5(cards: PlayingCard[]): PlayingCard[][] {
  const result: PlayingCard[][] = [];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) result.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return result;
}

// Best 5-card hand out of any number of cards >= 5 (used with 7: 2 hole + 5 community).
export function evaluateBestHand(cards: PlayingCard[]): EvaluatedHand {
  if (cards.length === 5) return evaluate5(cards);
  let best: EvaluatedHand | null = null;
  for (const combo of combinations5(cards)) {
    const hand = evaluate5(combo);
    if (!best || compareHands(hand, best) > 0) best = hand;
  }
  return best!;
}

// >0 if a beats b, <0 if b beats a, 0 if tied.
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
