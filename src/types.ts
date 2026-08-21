export type BetStatus = "open" | "locked" | "resolved" | "void";
export type Side = "yes" | "no";
export type BetCategory = "WFH" | "Sick" | "Late" | "Dare" | "Custom";

export interface User {
  id: string;
  name: string;
  tokenBalance: number;
}

export interface Bet {
  id: string;
  title: string;
  description: string;
  subjectUserId: string | null;
  // Set when the bet is about someone who hasn't joined the app yet (e.g.
  // "can Ploy finish 2 water bottles" before Ploy has ever logged in).
  // Mutually exclusive with subjectUserId — at most one is set.
  subjectName: string | null;
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

export type TransactionType = "stipend" | "wager" | "payout" | "refund";

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  timestamp: string;
}
