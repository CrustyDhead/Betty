import { DEFAULT_AVATAR_COLOR } from "../lib/avatars";

export function Avatar({
  name,
  emoji,
  color,
  size = "sm",
}: {
  name: string;
  emoji?: string | null;
  color?: string | null;
  size?: "sm" | "md";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const dims = size === "md" ? "h-9 w-9" : "h-7 w-7";
  const textSize = size === "md" ? (emoji ? "text-lg" : "text-sm") : emoji ? "text-sm" : "text-xs";

  return (
    <div
      className={`flex ${dims} ${textSize} shrink-0 items-center justify-center rounded-full font-display font-semibold text-white`}
      style={{ backgroundColor: color || DEFAULT_AVATAR_COLOR }}
      title={name}
      role="img"
      aria-label={`${name}'s avatar`}
    >
      {emoji || initial}
    </div>
  );
}
