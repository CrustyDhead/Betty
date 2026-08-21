export function Avatar({
  name,
  emoji,
  size = "sm",
}: {
  name: string;
  emoji?: string | null;
  size?: "sm" | "md";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const dims = size === "md" ? "h-9 w-9" : "h-7 w-7";
  const textSize = size === "md" ? (emoji ? "text-lg" : "text-sm") : emoji ? "text-sm" : "text-xs";

  return (
    <div
      className={`flex ${dims} ${textSize} shrink-0 items-center justify-center rounded-full bg-(--color-ink) font-display font-semibold text-white`}
      title={name}
    >
      {emoji || initial}
    </div>
  );
}
