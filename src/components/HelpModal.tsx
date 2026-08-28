import { useEffect } from "react";
import type { ReactNode } from "react";

export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="How to play"
      className="flex h-6 w-6 items-center justify-center rounded-full bg-(--color-surface) font-display text-xs font-bold text-(--color-ink-soft) shadow-sm shadow-black/5 transition hover:text-(--color-ink)"
    >
      !
    </button>
  );
}

export function HelpModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-(--color-surface) p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-(--color-ink)">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-(--color-ink-soft) transition hover:bg-black/5 hover:text-(--color-ink)"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-(--color-ink)">{children}</div>
      </div>
    </div>
  );
}
