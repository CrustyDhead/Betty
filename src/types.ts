export type BetStatus = "open" | "locked" | "resolved" | "void";
export type Side = "yes" | "no";
export type BetCategory = "WFH" | "Sick" | "Late" | "Dare" | "Custom";

export interface User {
  id: string;
  name: string;
  tokenBalance: number;
  avatarEmoji: string | null;
  avatarColor: string | null;
  lastCheckinAt: string | null;
  checkinStreak: number;
  isAdmin: boolean;
}

export type SignupCodeStatus = "pending" | "used" | "expired";

export interface SignupCodeRequest {
  id: string;
  name: string;
  code: string;
  status: SignupCodeStatus;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface Bet {
  id: string;
  title: string;
  description: string;
  subjectUserIds: string[];
  // People the bet is about who haven't joined the app yet (e.g. "can Ploy
  // finish 2 water bottles" before Ploy has ever logged in) — free text,
  // alongside subjectUserIds rather than instead of it.
  subjectNames: string[];
  creatorId: string;
  lockTime: string; // ISO timestamp
  status: BetStatus;
  outcome: Side | null;
  category: BetCategory;
  disputed: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  betId: string;
  userId: string;
  text: string;
  timestamp: string;
}

export interface Wager {
  id: string;
  betId: string;
  userId: string;
  side: Side;
  amount: number;
  payout: number | null;
}

export type TransactionType =
  | "stipend"
  | "wager"
  | "payout"
  | "refund"
  | "transfer"
  | "roulette"
  | "loan"
  | "repayment"
  | "adjustment"
  | "slots"
  | "blackjack"
  | "checkin";

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  // Which bet this relates to, for wager/payout/refund — null for
  // stipend/transfer/roulette, which aren't tied to a specific bet.
  betId: string | null;
  // The other party in a transfer — null for every other type.
  counterpartyUserId: string | null;
  timestamp: string;
}

export type RouletteBetType = "number" | "red" | "black" | "odd" | "even" | "low" | "high";
export type RouletteRoundStatus = "betting" | "spinning" | "resolved";

export interface RouletteLuckyNumber {
  number: number;
  multiplier: number;
}

export interface RouletteRound {
  id: string;
  status: RouletteRoundStatus;
  bettingClosesAt: string;
  luckyNumbers: RouletteLuckyNumber[] | null;
  winningNumber: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface RouletteBet {
  id: string;
  roundId: string;
  userId: string;
  betType: RouletteBetType;
  betValue: string | null;
  amount: number;
  payout: number | null;
}

export type LoanStatus = "active" | "overdue" | "repaid";

export interface Loan {
  id: string;
  userId: string;
  principal: number;
  interestRate: number;
  amountOwed: number;
  status: LoanStatus;
  borrowedAt: string;
  dueAt: string;
  repaidAt: string | null;
}

export interface SlotsSpin {
  id: string;
  userId: string;
  amount: number;
  reels: string[];
  payout: number;
  createdAt: string;
}

export type Suit = "♠" | "♥" | "♦" | "♣";

export interface PlayingCard {
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  suit: Suit;
}

export type BlackjackStatus = "player_turn" | "resolved";
export type BlackjackOutcome = "win" | "lose" | "push" | "blackjack";

export interface BlackjackHand {
  id: string;
  userId: string;
  betAmount: number;
  playerCards: PlayingCard[];
  dealerCards: PlayingCard[];
  status: BlackjackStatus;
  outcome: BlackjackOutcome | null;
  payout: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type BlackjackTableStatus = "betting" | "player_turns" | "dealer_turn" | "resolved";
export type BlackjackSeatStatus = "seated" | "playing" | "stood" | "bust" | "blackjack" | "resolved";

export interface BlackjackTable {
  id: string;
  status: BlackjackTableStatus;
  bettingClosesAt: string;
  dealerCards: PlayingCard[] | null;
  currentSeatIndex: number | null;
  turnEndsAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface BlackjackTableSeat {
  id: string;
  tableId: string;
  seatIndex: number;
  userId: string;
  status: BlackjackSeatStatus;
  betAmount: number | null;
  playerCards: PlayingCard[] | null;
  outcome: BlackjackOutcome | null;
  payout: number | null;
  joinedAt: string;
}

export type PokerTableStatus = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "hand_over";
export type PokerSeatStatus = "seated" | "active" | "folded" | "all_in";
export type PokerAction = "blind" | "fold" | "check" | "call" | "raise" | "all_in";
export type PokerResult = "won" | "lost" | "split" | "folded";

export interface PokerTable {
  id: string;
  status: PokerTableStatus;
  buttonSeatIndex: number | null;
  currentSeatIndex: number | null;
  turnEndsAt: string | null;
  actedSeatIndices: number[];
  currentBet: number;
  minRaise: number;
  handCap: number | null;
  pot: number;
  communityCards: PlayingCard[];
  deck: PlayingCard[];
  handNumber: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PokerTableSeat {
  id: string;
  tableId: string;
  seatIndex: number;
  userId: string;
  status: PokerSeatStatus;
  handCommitted: number;
  streetCommitted: number;
  lastAction: PokerAction | null;
  result: PokerResult | null;
  resultAmount: number | null;
  revealedHoleCards: PlayingCard[] | null;
  joinedAt: string;
}
