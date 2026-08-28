import { requestNotificationPermission, notificationPermission } from "../lib/store";
import { useCurrentUser, useStoreState } from "../lib/useStore";
import type { SignupCodeRequest } from "../types";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isActive(code: SignupCodeRequest) {
  return code.status === "pending" && new Date(code.expiresAt).getTime() > Date.now();
}

export function Admin() {
  const user = useCurrentUser();
  const state = useStoreState();

  if (!user) return null;
  if (!user.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-(--color-ink-soft)">
        This page is admin-only.
      </div>
    );
  }

  const codes = [...state.signupCodes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const active = codes.filter(isActive);
  const past = codes.filter((c) => !isActive(c));
  const notifPermission = notificationPermission();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-(--color-ink)">Admin</h1>
      <p className="mt-1 text-sm text-(--color-ink-soft)">
        New teammates request an access code from the login screen — relay the code below to them out of band
        (chat, in person). Existing names still just use the shared team PIN.
      </p>

      {notifPermission !== "granted" && (
        <button
          type="button"
          onClick={() => requestNotificationPermission()}
          className="mt-3 w-full rounded-xl bg-(--color-surface) py-2.5 text-center text-xs font-medium text-(--color-ink-soft) shadow-sm shadow-black/5 hover:text-(--color-ink)"
        >
          Enable notifications to get pinged when someone requests a code
        </button>
      )}

      <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
        Pending requests
      </h2>
      {active.length === 0 ? (
        <p className="mt-3 text-sm text-(--color-ink-soft)">No pending requests.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {active.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl bg-(--color-surface) px-4 py-3 shadow-sm shadow-black/5"
            >
              <div>
                <p className="text-sm font-medium text-(--color-ink)">{c.name}</p>
                <p className="text-xs text-(--color-ink-soft)">
                  requested {formatTimestamp(c.createdAt)} · expires {formatTimestamp(c.expiresAt)}
                </p>
              </div>
              <span className="rounded-lg bg-(--color-bg) px-3 py-1.5 font-mono text-lg font-bold tracking-widest text-(--color-ink)">
                {c.code}
              </span>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-(--color-ink-soft)">
            Past requests
          </h2>
          <div className="mt-3 space-y-1.5">
            {past.slice(0, 20).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg bg-(--color-surface) px-3 py-2 text-xs shadow-sm shadow-black/5"
              >
                <span className="font-medium text-(--color-ink)">{c.name}</span>
                <span className="text-(--color-ink-soft)">
                  {c.status === "used" ? "✅ used" : "⌛ expired"} · {formatTimestamp(c.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
