import type { ReactNode } from "react";

// "default" pills sit directly on the page background, so the inactive
// state uses --color-surface to stand out. "inset" pills sit inside a
// --color-surface card (a form, the chip tray), so the inactive state
// uses --color-bg instead — same idea, opposite direction.
export function TogglePill({
  active,
  onClick,
  variant = "default",
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  variant?: "default" | "inset";
  ariaLabel?: string;
  children: ReactNode;
}) {
  const inactiveBg = variant === "inset" ? "bg-(--color-bg)" : "bg-(--color-surface)";
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-(--color-ink) text-white" : `${inactiveBg} text-(--color-ink-soft) hover:text-(--color-ink)`
      }`}
    >
      {children}
    </button>
  );
}
