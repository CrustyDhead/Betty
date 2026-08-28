import type { PlayingCard, Suit } from "../types";

export const BLACKJACK_MIN_BET = 10;

const RANKS: PlayingCard["rank"][] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

// Infinite shoe — draws with replacement. No card counting to worry about,
// and it keeps dealing trivial (no shared deck state to track/reset).
export function drawCard(): PlayingCard {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank, suit };
}

function rankValue(rank: PlayingCard["rank"]): number {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

// Best total <= 21, counting aces as 11 unless that would bust, in which
// case they drop to 1 one at a time.
export function handValue(cards: PlayingCard[]): { total: number; soft: boolean } {
  let total = cards.reduce((sum, c) => sum + rankValue(c.rank), 0);
  let aces = cards.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: PlayingCard[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: PlayingCard[]): boolean {
  return handValue(cards).total > 21;
}

// Dealer stands on all 17s (including soft 17) — the simplest standard
// variant, easiest to explain and to verify.
export function dealerShouldHit(cards: PlayingCard[]): boolean {
  return handValue(cards).total < 17;
}

export function playDealerHand(startingCards: PlayingCard[]): PlayingCard[] {
  const cards = [...startingCards];
  while (dealerShouldHit(cards)) {
    cards.push(drawCard());
  }
  return cards;
}

export function formatCard(card: PlayingCard): string {
  return `${card.rank}${card.suit}`;
}

export interface BlackjackResult {
  outcome: "win" | "lose" | "push" | "blackjack";
  payout: number; // total returned, 0 on a loss
}

export function resolveHand(playerCards: PlayingCard[], dealerCards: PlayingCard[], bet: number): BlackjackResult {
  const playerBJ = isBlackjack(playerCards);
  const dealerBJ = isBlackjack(dealerCards);

  if (playerBJ && dealerBJ) return { outcome: "push", payout: bet };
  if (playerBJ) return { outcome: "blackjack", payout: bet * 2.5 };
  if (dealerBJ) return { outcome: "lose", payout: 0 };

  const player = handValue(playerCards).total;
  if (player > 21) return { outcome: "lose", payout: 0 };

  const dealer = handValue(dealerCards).total;
  if (dealer > 21) return { outcome: "win", payout: bet * 2 };
  if (player > dealer) return { outcome: "win", payout: bet * 2 };
  if (player < dealer) return { outcome: "lose", payout: 0 };
  return { outcome: "push", payout: bet };
}
