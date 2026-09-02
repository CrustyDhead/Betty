import { Link } from "react-router-dom";

const GAMES = [
  {
    to: "/casino/roulette",
    emoji: "🎰",
    title: "Roulette",
    description: "Continuous rounds, lucky-number multipliers up to 500x.",
  },
  {
    to: "/casino/slots",
    emoji: "🎲",
    title: "Slots",
    description: "3 reels, instant spin — match 2 for your stake back, 3 for the jackpot.",
  },
  {
    to: "/casino/blackjack",
    emoji: "🃏",
    title: "Blackjack",
    description: "Classic hit or stand against the dealer. Blackjack pays 3:2.",
  },
  {
    to: "/casino/blackjack/table",
    emoji: "🪑",
    title: "Blackjack Table",
    description: "Sit at a shared table — up to 5 players, one dealer, turns in order.",
  },
  {
    to: "/casino/poker",
    emoji: "♠️",
    title: "Poker",
    description: "Texas Hold'em, up to 6 players. No side pots — every hand caps at the smallest stack in.",
  },
];

export function Casino() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">Casino</h1>
      <p className="mt-1 text-sm text-(--color-ink-soft)">No real money. Pure bragging rights.</p>

      <div className="mt-5 space-y-3">
        {GAMES.map((g) => (
          <Link
            key={g.to}
            to={g.to}
            className="flex items-center gap-4 rounded-2xl bg-(--color-surface) p-5 shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-3xl">{g.emoji}</span>
            <div>
              <p className="font-display text-base font-semibold text-(--color-ink)">{g.title}</p>
              <p className="mt-0.5 text-sm text-(--color-ink-soft)">{g.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
