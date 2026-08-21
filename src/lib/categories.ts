import type { BetCategory } from "../types";

export const CATEGORIES: BetCategory[] = ["WFH", "Sick", "Late", "Dare", "Custom"];

export const CATEGORY_EMOJI: Record<BetCategory, string> = {
  WFH: "🏠",
  Sick: "🤒",
  Late: "⏰",
  Dare: "🎯",
  Custom: "🎲",
};
