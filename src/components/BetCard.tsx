import { Link } from "react-router-dom";
import type { Bet } from "../types";
import { betTotals, effectiveStatus, userPosition } from "../lib/store";
import { useStoreState } from "../lib/useStore";
import { SplitBar } from "./SplitBar";
import { Countdown } from "./Countdown";
import { Avatar } from "./Avatar";
import { CATEGORY_EMOJI } from "../lib/categories";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  locked: "Locked",
  resolved: "Resolved",
  void: "Void",
};

export function BetCard({ bet, currentUserId }: { bet: Bet; currentUserId: string | null }) {
  const state = useStoreState();
  const subject = bet.subjectUserId ? state.users.find((u) => u.id === bet.subjectUserId) : null;
  const subjectName = subject?.name ?? bet.subjectName;
  const { yes, no, total, wagers } = betTotals(bet.id);
  const status = effectiveStatus(bet);
  const position = currentUserId ? userPosition(bet.id, currentUserId) : null;

  return (
    <Link
      to={`/bets/${bet.id}`}
      className="block rounded-2xl bg-(--color-surface) p-5 shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {subjectName && (
            <Avatar name={subjectName} emoji={subject?.avatarEmoji} color={subject?.avatarColor} />
          )}
          <div>
            <h3 className="font-display text-base font-semibold leading-snug text-(--color-ink)">
              {bet.title}
            </h3>
            <p className="text-xs text-(--color-ink-soft)">
              {CATEGORY_EMOJI[bet.category]} {bet.category}
              {subjectName ? ` · about ${subjectName}` : ""}
            </p>
          </div>
        </div>
        {status === "open" ? (
          <Countdown lockTime={bet.lockTime} />
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 font-mono text-xs font-medium text-(--color-ink-soft)">
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>

      <div className="mt-4">
        <SplitBar yes={yes} no={no} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-sm font-medium text-(--color-ink)">
          {total.toLocaleString()} tokens
          {wagers.length > 0 && (
            <span className="ml-1.5 font-sans text-xs font-normal text-(--color-ink-soft)">
              · {wagers.length} {wagers.length === 1 ? "person" : "people"} in
            </span>
          )}
        </span>
        {position && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              position.side === "yes"
                ? "bg-(--color-yes-soft) text-(--color-yes-text)"
                : "bg-(--color-no-soft) text-(--color-no-text)"
            }`}
          >
            You: {position.amount} {position.side.toUpperCase()}
          </span>
        )}
      </div>
    </Link>
  );
}
