import { useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import { effectiveStatus } from "../lib/store";
import { BetCard } from "../components/BetCard";
import { TogglePill } from "../components/TogglePill";
import { CATEGORIES, CATEGORY_EMOJI } from "../lib/categories";
import type { BetCategory } from "../types";

export function Feed() {
  const state = useStoreState();
  const user = useCurrentUser();
  const [filter, setFilter] = useState<BetCategory | "All">("All");

  const bets = filter === "All" ? state.bets : state.bets.filter((b) => b.category === filter);
  const openBets = bets.filter((b) => effectiveStatus(b) === "open");
  const otherBets = bets.filter((b) => effectiveStatus(b) !== "open");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-(--color-ink)">Feed</h1>
        <Link
          to="/create"
          className="rounded-full bg-(--color-ink) px-4 py-2 font-display text-sm font-semibold text-white transition hover:opacity-90"
        >
          + New bet
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <TogglePill active={filter === "All"} onClick={() => setFilter("All")}>
          All
        </TogglePill>
        {CATEGORIES.map((c) => (
          <TogglePill key={c} active={filter === c} onClick={() => setFilter(c)}>
            {CATEGORY_EMOJI[c]} {c}
          </TogglePill>
        ))}
      </div>

      {bets.length === 0 && (
        <p className="mt-10 text-center text-sm text-(--color-ink-soft)">
          {filter === "All" ? "No bets yet. Start the chaos." : `No ${filter} bets right now.`}
        </p>
      )}

      {openBets.length > 0 && (
        <div className="mt-5 space-y-3">
          {openBets.map((bet) => (
            <BetCard key={bet.id} bet={bet} currentUserId={user?.id ?? null} />
          ))}
        </div>
      )}

      {otherBets.length > 0 && (
        <>
          <h2 className="mt-8 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Locked & settled
          </h2>
          <div className="mt-3 space-y-3">
            {otherBets.map((bet) => (
              <BetCard key={bet.id} bet={bet} currentUserId={user?.id ?? null} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
