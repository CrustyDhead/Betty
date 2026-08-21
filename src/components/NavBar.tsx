import { NavLink } from "react-router-dom";
import { useCurrentUser } from "../lib/useStore";
import { Avatar } from "./Avatar";

const LINKS = [
  { to: "/", label: "Feed" },
  { to: "/create", label: "Create" },
  { to: "/my-bets", label: "My Bets" },
  { to: "/leaderboard", label: "Leaderboard" },
];

export function NavBar() {
  const user = useCurrentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-black/5 bg-(--color-bg)/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 font-display text-sm font-medium transition ${
                  isActive
                    ? "bg-(--color-ink) text-white"
                    : "text-(--color-ink-soft) hover:bg-black/5 hover:text-(--color-ink)"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-(--color-ink)">
              {user.tokenBalance.toLocaleString()}
            </span>
            <NavLink
              to="/profile"
              className="rounded-full p-0.5 transition hover:opacity-70"
              title={`${user.name}'s profile`}
            >
              <Avatar name={user.name} />
            </NavLink>
          </div>
        )}
      </div>
    </header>
  );
}
