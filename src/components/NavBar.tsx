import { NavLink } from "react-router-dom";
import { useCurrentUser } from "../lib/useStore";
import { Avatar } from "./Avatar";

const LINKS = [
  { to: "/", label: "Feed", icon: "📋" },
  { to: "/create", label: "Create", icon: "➕" },
  { to: "/my-bets", label: "My Bets", icon: "🎫" },
  { to: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { to: "/casino", label: "Casino", icon: "🎰" },
];

export function NavBar() {
  const user = useCurrentUser();
  const links = user?.isAdmin ? [...LINKS, { to: "/admin", label: "Admin", icon: "🔑" }] : LINKS;

  return (
    <header className="sticky top-0 z-10 border-b border-black/5 bg-(--color-bg)/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <nav className="flex items-center gap-0.5 sm:gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              title={link.label}
              className={({ isActive }) =>
                `rounded-full px-2.5 py-1.5 font-display text-sm font-medium transition sm:px-3 ${
                  isActive
                    ? "bg-(--color-ink) text-white"
                    : "text-(--color-ink-soft) hover:bg-black/5 hover:text-(--color-ink)"
                }`
              }
            >
              <span className="sm:hidden" aria-hidden="true">
                {link.icon}
              </span>
              <span className="hidden sm:inline">{link.label}</span>
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-mono text-sm font-semibold text-(--color-ink)">
              {Math.round(user.tokenBalance).toLocaleString()}
            </span>
            <NavLink
              to="/profile"
              className="rounded-full p-0.5 transition hover:opacity-70"
              title={`${user.name}'s profile`}
            >
              <Avatar name={user.name} emoji={user.avatarEmoji} color={user.avatarColor} />
            </NavLink>
          </div>
        )}
      </div>
    </header>
  );
}
