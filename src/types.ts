export type BetStatus = "open" | "locked" | "resolved" | "void";
export type Side = "yes" | "no";
export type BetCategory = "WFH" | "Sick" | "Late" | "Custom";

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
