export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const dims = size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs";

  return (
    <div
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full bg-(--color-ink) font-display font-semibold text-white`}
      title={name}
    >
      {initial}
    </div>
  );
}
