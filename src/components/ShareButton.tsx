import { useState } from "react";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // user backed out of the share sheet — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("failed");
    }
  }

  if (status === "failed") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-40 rounded-full border border-black/10 bg-(--color-bg) px-2.5 py-1 text-xs text-(--color-ink)"
        />
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="text-xs font-medium text-(--color-ink-soft) hover:text-(--color-ink)"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-(--color-ink-soft) transition hover:bg-gray-200 hover:text-(--color-ink)"
    >
      {status === "copied" ? "Copied!" : "🔗 Share"}
    </button>
  );
}
