import { useEffect } from "react";
import { clearStipendAlert } from "../lib/store";
import { useStoreState } from "../lib/useStore";

const COPY = {
  normal: { emoji: "💰", label: "Weekly stipend" },
  boosted: { emoji: "✨", label: "Boosted stipend!" },
  jackpot: { emoji: "🎉", label: "JACKPOT stipend!!" },
};

export function StipendToast() {
  const state = useStoreState();
  const alert = state.stipendAlert;

  useEffect(() => {
    if (!alert) return;
    const id = setTimeout(() => clearStipendAlert(), 5000);
    return () => clearTimeout(id);
  }, [alert]);

  if (!alert) return null;
  const copy = COPY[alert.kind];

  return (
    <div className="fixed inset-x-0 top-4 z-20 flex justify-center px-4">
      <button
        onClick={() => clearStipendAlert()}
        className="flex items-center gap-2 rounded-full bg-(--color-ink) px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
      >
        <span className="text-base">{copy.emoji}</span>
        {copy.label} +{alert.amount} tokens
      </button>
    </div>
  );
}
